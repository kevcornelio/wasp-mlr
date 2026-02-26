import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

export const AppLayout = () => {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 p-6 overflow-auto fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
