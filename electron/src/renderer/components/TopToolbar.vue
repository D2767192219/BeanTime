<template>
  <header class="toolbar">
    <el-input
      :model-value="search"
      placeholder="搜索桌台 / 标签 / 编号 / 预约手机号"
      clearable
      class="toolbar-search"
      @update:model-value="(value) => emit('update:search', value)"
    />

    <div class="toolbar-actions">
      <el-button @click="emit('open-history')">历史记录</el-button>
      <el-button @click="emit('open-areas')">区域管理</el-button>
      <el-button @click="emit('open-revenue')">营收</el-button>
      <el-button @click="emit('open-settings')">设置</el-button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  search: {
    type: String,
    required: true,
  },
});

const emit = defineEmits([
  'update:search',
  'open-history',
  'open-areas',
  'open-revenue',
  'open-settings',
]);
</script>
