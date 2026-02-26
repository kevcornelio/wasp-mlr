import { useApp } from '@/context/AppContext';
import { statusConfig } from '@/components/StatusBadge';
import { TaskStatus } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CheckSquare, FolderKanban, Users } from 'lucide-react';

const statusColors: Record<TaskStatus, string> = {
  backlog: '#94a3b8',
  in_progress: '#3b82f6',
  in_review: '#f59e0b',
  done: '#22c55e',
  closed: '#64748b',
};

const DashboardPage = () => {
  const { tasks, projects, users } = useApp();

  const tasksByStatus = (Object.keys(statusConfig) as TaskStatus[]).map(status => ({
    name: statusConfig[status].label,
    count: tasks.filter(t => t.status === status).length,
    status,
  }));

  const stats = [
    { label: 'Total Tasks', value: tasks.length, icon: CheckSquare, color: 'bg-primary/10 text-primary' },
    { label: 'Projects', value: projects.length, icon: FolderKanban, color: 'bg-success/10 text-success' },
    { label: 'Team Members', value: users.length, icon: Users, color: 'bg-info/10 text-info' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {stats.map(stat => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-5 card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-foreground mb-4">Tasks by Status</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tasksByStatus} barSize={40}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {tasksByStatus.map((entry) => (
                  <Cell key={entry.status} fill={statusColors[entry.status]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
