<template>
  <el-card class="table-card" shadow="hover">
    <div class="table-card-head">
      <div>
        <div class="table-card-title">{{ table.name }}</div>
        <div class="table-card-sid">编号：{{ table.sessionId || '—' }}</div>
      </div>
      <el-tag :type="status.tag">{{ status.label }}</el-tag>
    </div>

    <div class="table-card-time-info">
      <div class="table-card-time-col">
        <span class="table-card-time-label">已用时长</span>
        <div class="table-card-timer">{{ running ? formatTime(getDuration(table)) : '--:--' }}</div>
      </div>
      <div class="table-card-time-col right">
        <span class="table-card-time-label">开始时间</span>
        <div class="table-card-start">{{ running ? formatStartTime(table.timerStart) : '--:--' }}</div>
      </div>
    </div>

    <div class="table-card-meta">
      <span>预计费用</span>
      <strong>{{ running ? formatMoney(calcRevenue(getDuration(table))) : '—' }}</strong>
    </div>

    <div class="table-card-actions">
      <!-- 空闲状态 -->
      <template v-if="table.status === 'idle'">
        <div class="btn-wrap">
          <el-button type="success" class="manage-btn" @click="emit('open', table)">立即开台</el-button>
        </div>
        <div class="btn-wrap">
          <el-button type="warning" class="manage-btn" @click="emit('reserve', table)">客户预约</el-button>
        </div>
      </template>

      <!-- 已预约状态：显示预约计时，有立即开台和取消预约按钮 -->
      <template v-else-if="table.status === 'reserved'">
        <div class="btn-wrap">
          <el-button type="primary" class="manage-btn" @click="emit('start', table)">立即开台</el-button>
        </div>
        <div class="btn-wrap">
          <el-button type="info" class="manage-btn" @click="emit('cancelReserve', table)">取消预约</el-button>
        </div>
      </template>

      <!-- 选豆中状态：开始计时占第一行，暂停计时和更换桌台在第二行 -->
      <template v-else-if="table.status === 'selecting'">
        <el-button type="primary" class="action-row-full" @click="emit('start', table)">开始计时</el-button>
        <div class="action-row-split">
          <el-button type="warning" @click="emit('pause', table)">暂停计时</el-button>
          <el-button @click="emit('change', table)">更换桌台</el-button>
        </div>
      </template>

      <!-- 使用中/暂停中状态 -->
      <template v-else>
        <el-button
          class="action-row-full"
          type="danger"
          @click="emit('settle', table)"
        >
          结束计时
        </el-button>

        <div class="action-row-split">
          <el-button
            :type="table.status === 'paused' ? 'primary' : 'warning'"
            @click="table.status === 'paused' ? emit('resume', table) : emit('pause', table)"
          >
            {{ table.status === 'paused' ? '继续计时' : '暂停计时' }}
          </el-button>
          <el-button @click="emit('change', table)">更换桌台</el-button>
        </div>
      </template>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  table: { type: Object, required: true },
  statusMeta: { type: Object, required: true },
  getDuration: { type: Function, required: true },
  calcRevenue: { type: Function, required: true },
  formatTime: { type: Function, required: true },
  formatMoney: { type: Function, required: true },
  formatStartTime: { type: Function, required: true },
});

const emit = defineEmits(['open', 'reserve', 'start', 'pause', 'resume', 'settle', 'change', 'cancelReserve']);

const status = computed(() => props.statusMeta[props.table.status] || { label: props.table.status, tag: 'info' });
const running = computed(() => props.table.status === 'in_use' || props.table.status === 'paused' || props.table.status === 'reserved');
</script>
