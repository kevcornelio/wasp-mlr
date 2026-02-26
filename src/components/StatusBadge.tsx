import { Priority, TaskStatus } from '@/types';
import { cn } from '@/lib/utils';

export const priorityConfig: Record<Priority, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-priority-critical text-primary-foreground' },
  high: { label: 'High', className: 'bg-priority-high text-primary-foreground' },
  medium: { label: 'Medium', className: 'bg-priority-medium text-primary-foreground' },
  low: { label: 'Low', className: 'bg-priority-low text-primary-foreground' },
  none: { label: 'None', className: 'bg-muted text-muted-foreground' },
};

export const statusConfig: Record<TaskStatus, { label: string; colClass: string }> = {
  backlog: { label: 'Backlog', colClass: 'kanban-col-backlog' },
  in_progress: { label: 'In Progress', colClass: 'kanban-col-progress' },
  in_review: { label: 'In Review', colClass: 'kanban-col-review' },
  done: { label: 'Done', colClass: 'kanban-col-done' },
  closed: { label: 'Closed', colClass: 'kanban-col-closed' },
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', priorityConfig[priority].className)}>
    {priorityConfig[priority].label}
  </span>
);
