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
      <template v-if="table.status === 'idle'">
        <el-button type="success" @click="emit('open', table)">立即开台</el-button>
        <el-button type="warning" @click="emit('reserve', table)">客户预约</el-button>
      </template>

      <template v-else>
        <el-button
          class="action-row-full"
          :type="table.status === 'reserved' || table.status === 'selecting' ? 'primary' : 'danger'"
          @click="table.status === 'reserved' || table.status === 'selecting' ? emit('start', table) : emit('settle', table)"
        >
          {{ table.status === 'reserved' || table.status === 'selecting' ? '开始计时' : '结束计时' }}
        </el-button>

        <el-button
          :type="table.status === 'paused' ? 'primary' : 'warning'"
          :disabled="table.status === 'reserved' || table.status === 'selecting'"
          @click="table.status === 'paused' ? emit('resume', table) : emit('pause', table)"
        >
          {{ table.status === 'paused' ? '继续计时' : '暂停计时' }}
        </el-button>
        <el-button @click="emit('change', table)">更换桌台</el-button>
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

const emit = defineEmits(['open', 'reserve', 'start', 'pause', 'resume', 'settle', 'change']);

const status = computed(() => props.statusMeta[props.table.status] || { label: props.table.status, tag: 'info' });
const running = computed(() => props.table.status === 'in_use' || props.table.status === 'paused');
</script>
