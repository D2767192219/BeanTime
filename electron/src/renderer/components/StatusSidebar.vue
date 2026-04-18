<template>
  <aside class="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-title">状态筛选</div>

      <button
        type="button"
        class="sidebar-item"
        :class="{ active: status === 'all' }"
        @click="emit('update:status', 'all')"
      >
        <span>全部</span>
        <el-tag size="small">{{ counts.all || 0 }}</el-tag>
      </button>

      <button
        v-for="item in statusMetaList"
        :key="item.value"
        type="button"
        class="sidebar-item"
        :class="{ active: status === item.value }"
        @click="emit('update:status', item.value)"
      >
        <span>{{ item.label }}</span>
        <el-tag size="small">{{ counts[item.value] || 0 }}</el-tag>
      </button>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">标签筛选</div>
      <div class="tag-wrap">
        <el-tag
          v-for="tagItem in tags"
          :key="tagItem"
          effect="plain"
          :type="tag === tagItem ? 'primary' : 'info'"
          class="tag-chip"
          @click="emit('update:tag', tag === tagItem ? '' : tagItem)"
        >
          {{ tagItem }}
        </el-tag>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">桌台管理</div>
      <div class="manage-actions">
        <el-button type="primary" plain @click="emit('open-add-table')">新建桌台</el-button>
        <el-button type="danger" plain @click="emit('open-delete-table')">删除桌台</el-button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, required: true },
  tag: { type: String, required: true },
  counts: { type: Object, required: true },
  tags: { type: Array, required: true },
  statusMeta: { type: Object, required: true },
  statusOrder: { type: Array, required: true },
});

const emit = defineEmits(['update:status', 'update:tag', 'open-add-table', 'open-delete-table']);

const statusMetaList = computed(() => props.statusOrder.map((key) => ({
  value: key,
  label: props.statusMeta[key]?.label || key,
})));
</script>
