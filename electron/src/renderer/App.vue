<template>
  <div class="page">
    <TopToolbar
      v-model:search="state.filters.search"
      @open-history="historyDialog.visible = true"
      @open-areas="areaDialog.visible = true"
      @open-revenue="revenueDialog.visible = true"
      @open-settings="openSettings"
    />

    <main class="layout">
      <StatusSidebar
        :status="state.filters.status"
        :tag="state.filters.tag"
        :counts="statusCounts"
        :tags="availableTags"
        :status-meta="STATUS_META"
        :status-order="STATUS_ORDER"
        @update:status="(value) => (state.filters.status = value)"
        @update:tag="(value) => (state.filters.tag = value)"
        @open-add-table="openAddDialog"
        @open-delete-table="openDeleteDialog"
      />

      <section class="workspace">
        <div class="area-filter">
          <el-check-tag :checked="state.filters.areaId === 'all'" @change="state.filters.areaId = 'all'">
            全部 ({{ areaCounts.all || 0 }})
          </el-check-tag>

          <el-check-tag
            v-for="area in state.areas"
            :key="area.id"
            :checked="state.filters.areaId === area.id"
            @change="state.filters.areaId = area.id"
          >
            {{ area.name }} ({{ areaCounts[area.id] || 0 }})
          </el-check-tag>
        </div>

        <div v-loading="state.loading" class="table-content">
          <div v-if="!filteredTables.length" class="empty">没有符合条件的桌台</div>

          <div v-else class="area-groups">
            <section v-for="group in groupedAreaTables" :key="group.key" class="area-group">
              <header class="area-group-head">
                <h3>{{ group.title }}</h3>
                <p>分区工作台</p>
              </header>

              <div class="table-grid">
                <TableCard
                  v-for="table in group.tables"
                  :key="table.id"
                  :table="table"
                  :status-meta="STATUS_META"
                  :get-duration="getDuration"
                  :calc-revenue="calcRevenue"
                  :format-time="formatTime"
                  :format-money="formatMoney"
                  :format-start-time="formatStartTime"
                  @open="openTable"
                  @reserve="reserveTable"
                  @start="startTable"
                  @pause="pauseTable"
                  @resume="resumeTable"
                  @settle="onEndTiming"
                  @change="onChange"
                />
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>

    <el-dialog v-model="addDialog.visible" title="新增桌台" width="500px">
      <el-form label-width="110px">
        <el-form-item label="区域">
          <el-select v-model="addDialog.areaId" style="width: 100%">
            <el-option v-for="area in state.areas" :key="area.id" :label="area.name" :value="area.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="首字母">
          <el-input v-model="addDialog.prefix" maxlength="1" placeholder="例如 A" style="width: 120px" />
        </el-form-item>
        <el-form-item label="起始数字">
          <el-input-number v-model="addDialog.startNum" :min="1" />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="addDialog.count" :min="1" :max="200" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="addDialog.tag" placeholder="可选" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="addDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="confirmAdd">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settingsDialog.visible" title="计费设置" width="420px">
      <el-form label-width="110px">
        <el-form-item label="每小时费率">
          <el-input-number v-model="settingsDialog.hourlyRate" :min="0" />
        </el-form-item>
        <el-form-item label="货币符号">
          <el-input v-model="settingsDialog.currency" maxlength="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="confirmSettings">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="areaDialog.visible" title="区域管理" width="560px">
      <el-form inline>
        <el-form-item label="区域名">
          <el-input v-model="areaDialog.name" placeholder="例如：大厅" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="areaDialog.color" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="confirmAddArea">新增区域</el-button>
        </el-form-item>
      </el-form>

      <div v-if="!state.areas.length" class="empty small-empty">暂无区域</div>
      <div v-else class="area-list">
        <div v-for="area in state.areas" :key="area.id" class="area-row">
          <div class="area-row-left">
            <el-tag :color="area.color" effect="dark" style="border: none">{{ area.name }}</el-tag>
            <span>{{ areaCounts[area.id] || 0 }} 桌</span>
          </div>
          <el-button type="danger" plain @click="confirmDeleteArea(area)">删除</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="changeDialog.visible" title="更换桌台" width="420px">
      <el-form label-width="100px">
        <el-form-item label="目标台桌">
          <el-select v-model="changeDialog.targetId" style="width: 100%" placeholder="选择空闲桌台">
            <el-option
              v-for="table in changeTargets"
              :key="table.id"
              :label="table.name"
              :value="table.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="changeDialog.visible = false">取消</el-button>
        <el-button type="primary" :disabled="!changeDialog.targetId" @click="confirmChange">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="endDialog.visible" title="结束计时" width="420px">
      <el-descriptions v-if="endTableRef" :column="1" border>
        <el-descriptions-item label="桌台">{{ endTableRef.name }}</el-descriptions-item>
        <el-descriptions-item label="编号">{{ endTableRef.sessionId || '—' }}</el-descriptions-item>
        <el-descriptions-item label="时长">{{ formatDuration(getDuration(endTableRef)) }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(calcRevenue(getDuration(endTableRef))) }}</el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="endDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="confirmEndTiming">确认结束</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="revenueDialog.visible" title="营收统计" width="760px">
      <el-row :gutter="12" style="margin-bottom: 12px">
        <el-col :span="12">
          <el-card shadow="never">今日营收：<strong>{{ formatMoney(todayRevenue) }}</strong></el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never">累计营收：<strong>{{ formatMoney(totalRevenue) }}</strong></el-card>
        </el-col>
      </el-row>

      <el-table :data="sortedRecords" height="320" empty-text="暂无结算记录">
        <el-table-column prop="tableName" label="桌台" min-width="120" />
        <el-table-column prop="sessionId" label="编号" min-width="110" />
        <el-table-column label="时长" min-width="110">
          <template #default="scope">{{ formatDuration(scope.row.duration) }}</template>
        </el-table-column>
        <el-table-column label="金额" min-width="120">
          <template #default="scope">{{ formatMoney(scope.row.revenue) }}</template>
        </el-table-column>
        <el-table-column label="时间" min-width="180">
          <template #default="scope">
            {{ new Date(scope.row.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button type="danger" plain @click="confirmClearRecords">清空记录</el-button>
        <el-button @click="revenueDialog.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialog.visible" title="历史记录" width="860px">
      <el-table :data="sortedHistories" height="360" empty-text="暂无历史记录">
        <el-table-column prop="tableCode" label="桌台" min-width="100" />
        <el-table-column prop="duration" label="时长" min-width="120">
          <template #default="scope">{{ formatDuration(scope.row.duration) }}</template>
        </el-table-column>
        <el-table-column prop="revenue" label="金额" min-width="120">
          <template #default="scope">{{ formatMoney(scope.row.revenue) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="结束时间" min-width="180">
          <template #default="scope">{{ new Date(scope.row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column prop="restoredAt" label="状态" min-width="140">
          <template #default="scope">{{ scope.row.restoredAt ? '已恢复' : '可恢复' }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" fixed="right">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="onRestoreHistory(scope.row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="deleteDialog.visible" title="删除桌台" width="520px">
      <el-table :data="state.tables" max-height="380">
        <el-table-column width="52">
          <template #default="scope">
            <el-checkbox :model-value="deleteDialog.selectedIds.includes(scope.row.id)" @change="(checked) => toggleDeleteSelection(scope.row.id, checked)" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="桌台" min-width="150" />
        <el-table-column prop="sessionId" label="编号" min-width="120">
          <template #default="scope">{{ scope.row.sessionId || '—' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">{{ STATUS_META[scope.row.status]?.label || scope.row.status }}</template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="deleteDialog.visible = false">取消</el-button>
        <el-button type="danger" :disabled="!deleteDialog.selectedIds.length" @click="confirmDeleteSelectedTables">
          删除选中（{{ deleteDialog.selectedIds.length }}）
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import TopToolbar from './components/TopToolbar.vue';
import StatusSidebar from './components/StatusSidebar.vue';
import TableCard from './components/TableCard.vue';
import { useAppStore } from './composables/useAppStore';

const {
  STATUS_ORDER,
  STATUS_META,
  state,
  statusCounts,
  areaCounts,
  availableTags,
  filteredTables,
  sortedRecords,
  sortedHistories,
  todayRevenue,
  totalRevenue,
  getDuration,
  calcRevenue,
  formatDuration,
  formatMoney,
  formatTime,
  formatStartTime,
  openTable,
  reserveTable,
  startTable,
  pauseTable,
  resumeTable,
  endTiming,
  restoreFromHistory,
  changeTable,
  deleteTable,
  addTables,
  addArea,
  deleteArea,
  saveSettings,
  clearRecords,
} = useAppStore();

const addDialog = reactive({ visible: false, areaId: '', prefix: 'A', startNum: 1, count: 1, tag: '' });
const settingsDialog = reactive({ visible: false, hourlyRate: 30, currency: '¥' });
const areaDialog = reactive({ visible: false, name: '', color: '#4f8df6' });
const changeDialog = reactive({ visible: false, fromId: '', targetId: '' });
const endDialog = reactive({ visible: false, tableId: '' });
const revenueDialog = reactive({ visible: false });
const historyDialog = reactive({ visible: false });
const deleteDialog = reactive({ visible: false, selectedIds: [] });

const changeTargets = computed(() => state.tables.filter((x) => x.id !== changeDialog.fromId && x.status === 'idle'));
const endTableRef = computed(() => state.tables.find((x) => x.id === endDialog.tableId) || null);

const groupedAreaTables = computed(() => {
  const grouped = new Map();

  for (const table of filteredTables.value) {
    const key = table.areaId || '__none__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(table);
  }

  const groups = [];
  const pushGroup = (key, title) => {
    if (!grouped.has(key)) return;
    groups.push({ key, title, tables: grouped.get(key) });
    grouped.delete(key);
  };

  if (state.filters.areaId === 'all') {
    for (const area of state.areas) {
      pushGroup(area.id, area.name);
    }
    pushGroup('__none__', '未分区');
  } else {
    const area = state.areas.find((x) => x.id === state.filters.areaId);
    const title = area?.name || '未分区';
    pushGroup(state.filters.areaId || '__none__', title);
  }

  for (const [key, tables] of grouped.entries()) {
    groups.push({ key, title: '未分区', tables });
  }

  return groups;
});

function openAddDialog() {
  addDialog.visible = true;
  addDialog.areaId = state.areas[0]?.id || '';
  addDialog.tag = '';
  addDialog.count = 1;
  addDialog.prefix = 'A';

  const numbers = state.tables
    .filter((x) => x.areaId === addDialog.areaId)
    .map((x) => Number(x.number) || 0);
  addDialog.startNum = numbers.length ? Math.max(...numbers) + 1 : 1;
}

function confirmAdd() {
  if (!addDialog.areaId) {
    ElMessage.warning('请先选择区域');
    return;
  }

  addTables({
    areaId: addDialog.areaId,
    prefix: addDialog.prefix,
    startNum: Number(addDialog.startNum) || 1,
    count: Math.max(1, Number(addDialog.count) || 1),
    tag: addDialog.tag || '',
  });

  addDialog.visible = false;
}

function openSettings() {
  settingsDialog.visible = true;
  settingsDialog.hourlyRate = state.settings.hourlyRate;
  settingsDialog.currency = state.settings.currency;
}

function confirmSettings() {
  if (Number(settingsDialog.hourlyRate) < 0) {
    ElMessage.warning('费率不能小于 0');
    return;
  }

  saveSettings({
    hourlyRate: Number(settingsDialog.hourlyRate) || 0,
    currency: settingsDialog.currency || '¥',
  });

  settingsDialog.visible = false;
}

function confirmAddArea() {
  const name = areaDialog.name.trim();
  if (!name) {
    ElMessage.warning('请输入区域名');
    return;
  }

  const ok = addArea({ name, color: areaDialog.color || '#4f8df6' });
  if (ok) areaDialog.name = '';
}

function onChange(table) {
  changeDialog.visible = true;
  changeDialog.fromId = table.id;
  changeDialog.targetId = '';
}

function confirmChange() {
  changeTable(changeDialog.fromId, changeDialog.targetId);
  changeDialog.visible = false;
}

function onEndTiming(table) {
  endDialog.visible = true;
  endDialog.tableId = table.id;
}

function confirmEndTiming() {
  if (!endTableRef.value) return;
  endTiming(endTableRef.value);
  endDialog.visible = false;
}

async function onRestoreHistory(history) {
  const firstTry = restoreFromHistory(history);
  if (firstTry.ok) {
    ElMessage.success('已恢复计时状态');
    return;
  }

  if (firstTry.reason !== 'need_overwrite_confirm') {
    ElMessage.error('恢复失败');
    return;
  }

  const overwrite = await ElMessageBox.confirm('该桌台已开始新的计时，是否覆盖为历史状态？', '恢复确认', {
    type: 'warning',
    confirmButtonText: '覆盖恢复',
    cancelButtonText: '取消',
  }).then(() => true).catch(() => false);

  if (!overwrite) return;

  const secondTry = restoreFromHistory(history, { overwrite: true });
  if (secondTry.ok) ElMessage.success('已覆盖恢复');
}

function openDeleteDialog() {
  deleteDialog.visible = true;
  deleteDialog.selectedIds = [];
}

function toggleDeleteSelection(id, checked) {
  if (checked) {
    if (!deleteDialog.selectedIds.includes(id)) {
      deleteDialog.selectedIds.push(id);
    }
    return;
  }
  deleteDialog.selectedIds = deleteDialog.selectedIds.filter((item) => item !== id);
}

async function confirmDeleteSelectedTables() {
  const count = deleteDialog.selectedIds.length;
  if (!count) return;

  const ok = await ElMessageBox.confirm(`确认删除选中的 ${count} 个桌台吗？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  }).then(() => true).catch(() => false);

  if (!ok) return;

  for (const id of deleteDialog.selectedIds) {
    deleteTable(id);
  }

  deleteDialog.visible = false;
  deleteDialog.selectedIds = [];
}

async function confirmDeleteArea(area) {
  const ok = await ElMessageBox.confirm(`删除区域「${area.name}」？区域内桌台会变成未分区。`, '删除区域', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  }).then(() => true).catch(() => false);

  if (ok) deleteArea(area.id);
}

async function confirmClearRecords() {
  const ok = await ElMessageBox.confirm('确认清空所有结算记录？', '清空记录', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  }).then(() => true).catch(() => false);

  if (ok) clearRecords();
}
</script>
