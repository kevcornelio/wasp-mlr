import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Task, TaskStatus, Priority } from '@/types';
import { statusConfig, PriorityBadge } from '@/components/StatusBadge';
import { TaskModal } from '@/components/TaskModal';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const statuses: TaskStatus[] = ['backlog', 'in_progress', 'in_review', 'done', 'closed'];

const TasksPage = () => {
  const { tasks, setTasks, users, projects } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleSave = (task: Task) => {
    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    } else {
      setTasks(prev => [...prev, { ...task, id: `t-${Date.now()}` }]);
    }
    setModalOpen(false);
    setEditingTask(null);
  };

  const handleDelete = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const openCreate = () => { setEditingTask(null); setModalOpen(true); };
  const openEdit = (task: Task) => { setEditingTask(task); setModalOpen(true); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {statuses.map(status => {
          const config = statusConfig[status];
          const colTasks = tasks.filter(t => t.status === status);
          return (
            <div key={status} className="min-w-[260px] flex-1">
              <div className={`rounded-xl p-3 ${config.colClass} min-h-[400px]`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(task => {
                    const assignee = users.find(u => u.id === task.assigneeId);
                    return (
                      <div key={task.id} className="bg-card rounded-lg p-3 border border-border card-hover group">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium text-foreground leading-snug flex-1 mr-2">{task.title}</h4>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(task)} className="p-1 rounded hover:bg-accent">
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDelete(task.id)} className="p-1 rounded hover:bg-destructive/10">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <PriorityBadge priority={task.priority} />
                          {assignee && (
                            <span className="text-xs text-muted-foreground">{assignee.fullName}</span>
                          )}
                        </div>
                        {task.deadline && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(task.deadline), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TaskModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setEditingTask(null); }}
        task={editingTask}
        onSave={handleSave}
      />
    </div>
  );
};

export default TasksPage;
