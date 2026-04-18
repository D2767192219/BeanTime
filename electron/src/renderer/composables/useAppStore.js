import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { db } from '../services/db';

const STATUS_ORDER = ['idle', 'reserved', 'selecting', 'in_use', 'paused'];

const STATUS_META = {
  idle: { label: '空闲', tag: 'success' },
  reserved: { label: '已预约', tag: 'warning' },
  selecting: { label: '选豆中', tag: 'warning' },
  in_use: { label: '使用中', tag: 'primary' },
  paused: { label: '暂停中', tag: 'danger' },
};

const DEFAULT_SETTINGS = { key: 'main', hourlyRate: 30, currency: '¥' };

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const genNumericId = () => String(Math.floor(100000 + Math.random() * 900000));
const pad = (value) => String(value).padStart(2, '0');

const normalizePrefix = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  const first = raw.match(/[A-Z]/)?.[0];
  return first || 'A';
};

function isToday(ts) {
  const now = new Date();
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function parseCode(name) {
  const m = String(name || '').trim().toUpperCase().match(/^([A-Z])-?(\d+)$/);
  if (!m) return null;
  return { codePrefix: m[1], number: Number(m[2]) };
}

export function useAppStore() {
  const now = ref(Date.now());
  let timer = null;

  const state = reactive({
    loading: true,
    areas: [],
    tables: [],
    records: [],
    histories: [],
    settings: { ...DEFAULT_SETTINGS },
    filters: {
      status: 'all',
      areaId: 'all',
      tag: '',
      search: '',
    },
  });

  const statusCounts = computed(() => {
    const map = { all: state.tables.length };
    for (const status of STATUS_ORDER) map[status] = 0;
    for (const table of state.tables) {
      if (map[table.status] !== undefined) map[table.status] += 1;
    }
    return map;
  });

  const areaCounts = computed(() => {
    const map = { all: state.tables.length };
    for (const area of state.areas) map[area.id] = 0;
    for (const table of state.tables) {
      if (map[table.areaId] !== undefined) map[table.areaId] += 1;
    }
    return map;
  });

  const availableTags = computed(() => [...new Set(state.tables.map((x) => x.tag).filter(Boolean))].sort());

  const areaMap = computed(() => {
    const map = Object.create(null);
    for (const area of state.areas) map[area.id] = area;
    return map;
  });

  const filteredTables = computed(() => {
    const q = state.filters.search.trim().toLowerCase();
    return state.tables
      .filter((table) => {
        if (state.filters.status !== 'all' && table.status !== state.filters.status) return false;
        if (state.filters.areaId !== 'all' && table.areaId !== state.filters.areaId) return false;
        if (state.filters.tag && table.tag !== state.filters.tag) return false;
        if (!q) return true;

        const tableCode = `${table.codePrefix || 'A'}-${table.number || 0}`;
        return [tableCode, table.name, table.tag, table.sessionId]
          .some((item) => String(item || '').toLowerCase().includes(q));
      })
      .sort((a, b) => (a.number || 0) - (b.number || 0));
  });

  const todayRevenue = computed(() => state.records.filter((r) => isToday(r.createdAt)).reduce((sum, r) => sum + (r.revenue || 0), 0));
  const totalRevenue = computed(() => state.records.reduce((sum, r) => sum + (r.revenue || 0), 0));
  const sortedRecords = computed(() => [...state.records].sort((a, b) => b.createdAt - a.createdAt));
  const sortedHistories = computed(() => [...state.histories].sort((a, b) => b.createdAt - a.createdAt));
const timingHistories = computed(() => sortedHistories.value.filter((h) => h.type === 'timing'));
const reserveHistories = computed(() => sortedHistories.value.filter((h) => h.type === 'reserve'));

  function getDuration(table) {
    if (!table.timerStart) return 0;
    if (table.status === 'paused') return table.timerPausedTime || 0;
    return Math.max(0, now.value - table.timerStart - (table.totalPausedDuration || 0));
  }

  function calcRevenue(ms) {
    return Math.max(0, (ms || 0) / 3600000 * (state.settings.hourlyRate || 0));
  }

  function formatTime(ms) {
    const sec = Math.floor((ms || 0) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  function formatDuration(ms) {
    const sec = Math.floor((ms || 0) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}小时${m}分钟` : `${m}分钟`;
  }

  function formatMoney(value) {
    return `${state.settings.currency}${(value || 0).toFixed(2)}`;
  }

  function formatStartTime(timestamp) {
    if (!timestamp) return '--:--';
    const d = new Date(timestamp);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatTableCode(table) {
    return `${table.codePrefix || 'A'}-${table.number || 0}`;
  }

  function persistTable(table) {
    db.put('tables', table).catch((error) => {
      console.error('[persistTable error]', error);
      ElMessage.error('数据保存失败');
    });
  }

  function resetTable(table) {
    table.status = 'idle';
    table.timerStart = null;
    table.timerPausedTime = 0;
    table.totalPausedDuration = 0;
    table.sessionId = null;
  }

  function ensureTableShape(table, fallbackPrefix = 'A') {
    const parsed = parseCode(table.name);

    if (!table.number || Number.isNaN(Number(table.number))) {
      table.number = parsed?.number || 1;
    } else {
      table.number = Number(table.number);
    }

    table.codePrefix = normalizePrefix(table.codePrefix || parsed?.codePrefix || fallbackPrefix);
    table.name = `${table.codePrefix}-${table.number}`;

    if (table.timerPausedTime == null) table.timerPausedTime = 0;
    if (table.totalPausedDuration == null) table.totalPausedDuration = 0;
    if (!table.status) table.status = 'idle';
  }

  function openTable(table) {
    table.status = 'selecting';
    table.sessionId = genNumericId();
    table.timerStart = null;
    table.timerPausedTime = 0;
    table.totalPausedDuration = 0;
    persistTable(table);
    ElMessage.success(`「${table.name}」已开台`);
  }

  function reserveTable(table) {
    table.status = 'reserved';
    table.sessionId = genNumericId();
    table.timerStart = Date.now();  // 预约开始计时
    table.timerPausedTime = 0;
    table.totalPausedDuration = 0;
    persistTable(table);
    ElMessage.success(`「${table.name}」已预约`);
  }

  function cancelReserve(table) {
    const duration = getDuration(table);

    // 生成预约取消记录
    const reserveRecord = {
      id: uuid(),
      tableId: table.id,
      tableName: table.name,
      areaName: areaMap.value[table.areaId]?.name || '',
      sessionId: table.sessionId || '',
      startTime: table.timerStart || Date.now(),
      endTime: Date.now(),
      duration,
      revenue: 0,
      type: 'reserve_cancel',  // 预约取消记录
      createdAt: Date.now(),
    };

    state.records.push(reserveRecord);
    db.put('records', reserveRecord).catch((error) => {
      console.error('[put reserve cancel record error]', error);
    });

    // 创建预约历史记录，可恢复
    const history = {
      id: uuid(),
      tableId: table.id,
      tableCode: table.name,
      createdAt: Date.now(),
      duration,
      revenue: 0,
      type: 'reserve',  // 预约记录类型
      tableSnapshot: clone(table),
      recordId: reserveRecord.id,
      restoredAt: null,
    };
    state.histories.push(history);
    db.put('histories', history).catch((error) => {
      console.error('[put history error]', error);
    });

    resetTable(table);
    persistTable(table);
    ElMessage.success(`「${table.name}」已取消预约`);
  }

  function startTable(table) {
    if (table.status === 'reserved') {
      // 从预约状态转为选豆中，清空预约计时
      table.timerStart = null;
      table.totalPausedDuration = 0;
      table.timerPausedTime = 0;
      table.status = 'selecting';
      persistTable(table);
      ElMessage.success(`「${table.name}」已开始选豆`);
    } else if (table.status === 'selecting') {
      table.status = 'in_use';
      if (!table.timerStart) {
        table.timerStart = Date.now();
      }
      table.timerPausedTime = 0;
      table.totalPausedDuration = 0;
      persistTable(table);
      ElMessage.success(`「${table.name}」开始计时`);
    }
  }

  function pauseTable(table) {
    table.status = 'paused';
    table.timerPausedTime = Date.now() - table.timerStart - (table.totalPausedDuration || 0);
    persistTable(table);
  }

  function resumeTable(table) {
    table.status = 'in_use';
    table.totalPausedDuration = Date.now() - table.timerStart - (table.timerPausedTime || 0);
    persistTable(table);
  }

  function endTiming(table) {
    const endTime = Date.now();
    const duration = getDuration(table);
    const revenue = calcRevenue(duration);
    const tableSnapshot = clone(table);

    const record = {
      id: uuid(),
      tableId: table.id,
      tableName: table.name,
      areaName: areaMap.value[table.areaId]?.name || '',
      sessionId: table.sessionId || '',
      startTime: table.timerStart || endTime,
      endTime,
      duration,
      revenue,
      type: 'timing',  // 计时记录
      createdAt: endTime,
    };

    state.records.push(record);
    db.put('records', record).catch((error) => {
      console.error('[put record error]', error);
      ElMessage.error('结算记录保存失败');
    });

    const history = {
      id: uuid(),
      tableId: table.id,
      tableCode: table.name,
      createdAt: endTime,
      duration,
      revenue,
      type: 'timing',  // 计时记录类型
      tableSnapshot,
      recordId: record.id,
      restoredAt: null,
    };
    state.histories.push(history);
    db.put('histories', history).catch((error) => {
      console.error('[put history error]', error);
    });

    resetTable(table);
    persistTable(table);
    ElMessage.success(`已结束计时 ${formatMoney(revenue)}`);
  }

  function restoreFromHistory(history, { overwrite = false } = {}) {
    const table = state.tables.find((x) => x.id === history.tableId);
    if (!table) return { ok: false, reason: 'table_missing' };

    const tableBusy = table.status !== 'idle' || Boolean(table.timerStart);
    if (tableBusy && !overwrite) {
      return { ok: false, reason: 'need_overwrite_confirm' };
    }

    const snapshot = clone(history.tableSnapshot || {});
    ensureTableShape(snapshot, table.codePrefix || 'A');

    Object.assign(table, snapshot);
    persistTable(table);

    if (history.recordId) {
      state.records = state.records.filter((x) => x.id !== history.recordId);
      db.del('records', history.recordId).catch((error) => {
        console.error('[delete record for restore error]', error);
      });
    }

    history.restoredAt = Date.now();
    db.put('histories', history).catch((error) => {
      console.error('[update history error]', error);
    });

    return { ok: true };
  }

  function changeTable(fromId, toId) {
    const from = state.tables.find((x) => x.id === fromId);
    const to = state.tables.find((x) => x.id === toId);
    if (!from || !to) return;

    const tempStatus = from.status;
    const tempSessionId = from.sessionId;
    const tempTimerStart = from.timerStart;
    const tempTimerPausedTime = from.timerPausedTime;
    const tempTotalPausedDuration = from.totalPausedDuration;

    from.status = to.status;
    from.sessionId = to.sessionId;
    from.timerStart = to.timerStart;
    from.timerPausedTime = to.timerPausedTime;
    from.totalPausedDuration = to.totalPausedDuration;

    to.status = tempStatus;
    to.sessionId = tempSessionId;
    to.timerStart = tempTimerStart;
    to.timerPausedTime = tempTimerPausedTime;
    to.totalPausedDuration = tempTotalPausedDuration;

    persistTable(from);
    persistTable(to);
    ElMessage.success(`「${from.name}」与「${to.name}」已互换`);
  }

  function deleteTable(id) {
    state.tables = state.tables.filter((table) => table.id !== id);
    db.del('tables', id).catch((error) => {
      console.error('[delete table error]', error);
      ElMessage.error('删除失败');
    });
  }

  function editTable(id, updates) {
    const table = state.tables.find((x) => x.id === id);
    if (!table) return false;

    if (updates.name != null) {
      const parsed = parseCode(updates.name);
      if (parsed) {
        table.codePrefix = normalizePrefix(parsed.codePrefix);
        table.number = parsed.number;
        table.name = `${table.codePrefix}-${table.number}`;
      } else {
        table.name = updates.name;
      }
    }
    if (updates.areaId != null) table.areaId = updates.areaId;
    if (updates.tag != null) table.tag = updates.tag;

    persistTable(table);
    return true;
  }

  function addTables({ areaId, startNum, count, tag, prefix }) {
    const finalPrefix = normalizePrefix(prefix);
    const newTables = [];

    for (let i = 0; i < count; i += 1) {
      const number = startNum + i;
      newTables.push({
        id: uuid(),
        name: `${finalPrefix}-${number}`,
        codePrefix: finalPrefix,
        number,
        tag: tag.trim(),
        areaId,
        status: 'idle',
        sessionId: null,
        timerStart: null,
        timerPausedTime: 0,
        totalPausedDuration: 0,
        createdAt: Date.now(),
      });
    }

    state.tables.push(...newTables);
    db.putBatch('tables', newTables).catch((error) => {
      console.error('[add tables error]', error);
      ElMessage.error('批量新增失败');
    });

    ElMessage.success(`已新增 ${newTables.length} 个桌台`);
  }

  function addArea({ name, color }) {
    if (state.areas.some((x) => x.name === name)) {
      ElMessage.warning('区域名已存在');
      return false;
    }

    const area = { id: uuid(), name, color };
    state.areas.push(area);
    db.put('areas', area).catch((error) => {
      console.error('[add area error]', error);
      ElMessage.error('区域新增失败');
    });

    return true;
  }

  function deleteArea(id) {
    state.areas = state.areas.filter((x) => x.id !== id);
    db.del('areas', id).catch((error) => {
      console.error('[delete area error]', error);
      ElMessage.error('区域删除失败');
    });

    const affected = [];
    for (const table of state.tables) {
      if (table.areaId === id) {
        table.areaId = '';
        affected.push(table);
      }
    }

    if (affected.length) {
      db.putBatch('tables', affected).catch((error) => {
        console.error('[update table area error]', error);
      });
    }

    if (state.filters.areaId === id) state.filters.areaId = 'all';
  }

  function saveSettings(nextSettings) {
    state.settings = { ...state.settings, ...nextSettings };
    db.put('settings', state.settings).catch((error) => {
      console.error('[save settings error]', error);
      ElMessage.error('设置保存失败');
    });
  }

  function clearRecords() {
    const ids = state.records.map((x) => x.id);
    state.records = [];

    for (const id of ids) {
      db.del('records', id).catch((error) => {
        console.error('[delete record error]', error);
      });
    }
  }

  async function init() {
    const data = await db.loadAll();
    state.areas = data.areas || [];
    state.tables = data.tables || [];
    state.records = data.records || [];
    state.histories = data.histories || [];
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

    if (!state.areas.length) {
      const defaults = [
        { id: uuid(), name: '大厅', color: '#4f8df6' },
        { id: uuid(), name: '单人间', color: '#16a085' },
        { id: uuid(), name: '包间', color: '#e67e22' },
      ];
      state.areas.push(...defaults);
      await db.putBatch('areas', defaults);
    }

    const fallbackPrefixByArea = Object.create(null);
    state.areas.forEach((area, idx) => {
      fallbackPrefixByArea[area.id] = normalizePrefix(String.fromCharCode(65 + (idx % 26)));
    });

    const migrated = [];
    for (const table of state.tables) {
      const before = JSON.stringify(table);
      ensureTableShape(table, fallbackPrefixByArea[table.areaId] || 'A');
      if (JSON.stringify(table) !== before) migrated.push(table);
    }
    if (migrated.length) {
      db.putBatch('tables', migrated).catch(() => {});
    }

    state.loading = false;
  }

  function bindExternalEvents() {
    window.electronAPI.onDataImported((data) => {
      db.replaceAll(data);
      state.areas = data.areas || [];
      state.tables = data.tables || [];
      state.records = data.records || [];
      state.histories = data.histories || [];
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      ElMessage.success('数据已导入');
    });

    window.electronAPI.onShowToast((msg) => {
      ElMessage.info(msg);
    });
  }

  onMounted(async () => {
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);

    await init();
    bindExternalEvents();
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return {
    STATUS_ORDER,
    STATUS_META,
    state,
    statusCounts,
    areaCounts,
    availableTags,
    filteredTables,
    sortedRecords,
    sortedHistories,
    timingHistories,
    reserveHistories,
    todayRevenue,
    totalRevenue,
    getDuration,
    calcRevenue,
    formatTime,
    formatDuration,
    formatMoney,
    formatStartTime,
    formatTableCode,
    openTable,
    reserveTable,
    cancelReserve,
    startTable,
    pauseTable,
    resumeTable,
    endTiming,
    restoreFromHistory,
    changeTable,
    deleteTable,
    editTable,
    addTables,
    addArea,
    deleteArea,
    saveSettings,
    clearRecords,
  };
}
