import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Project, Priority } from '@/types';
import { PriorityBadge } from '@/components/StatusBadge';
import { ProjectModal } from '@/components/ProjectModal';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';

const ProjectsPage = () => {
  const { projects, setProjects, users } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const handleSave = (project: Project) => {
    if (editing) {
      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
    } else {
      setProjects(prev => [...prev, { ...project, id: `p-${Date.now()}` }]);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => setProjects(prev => prev.filter(p => p.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Project
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => {
          const members = users.filter(u => project.members.includes(u.id));
          return (
            <div key={project.id} className="bg-card rounded-xl border border-border p-5 card-hover group">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-semibold text-foreground">{project.title}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(project); setModalOpen(true); }} className="p-1 rounded hover:bg-accent">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(project.id)} className="p-1 rounded hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
              <div className="flex items-center gap-2 mb-3">
                <PriorityBadge priority={project.priority} />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <Users className="h-3 w-3" />
                {members.map(m => m.fullName).join(', ') || 'No members'}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(project.deadline), 'MMM d, yyyy')}
              </div>
            </div>
          );
        })}
      </div>

      <ProjectModal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }} project={editing} onSave={handleSave} />
    </div>
  );
};

export default ProjectsPage;
