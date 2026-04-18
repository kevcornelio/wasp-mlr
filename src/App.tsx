import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ChatPage from "@/pages/ChatPage";
import AuthPage from "@/pages/AuthPage";
import PreferencesPage from "@/pages/PreferencesPage";
import FoodSpotsPage from "@/pages/FoodSpotsPage";
import AdminPage from "@/pages/AdminPage";
import BlogListPage from "@/pages/BlogListPage";
import BlogPostPage from "@/pages/BlogPostPage";
import BlogEditorPage from "@/pages/BlogEditorPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/spots" element={<FoodSpotsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/blog" element={<BlogListPage />} />
            <Route path="/blog/new" element={<BlogEditorPage />} />
            <Route path="/blog/:id" element={<BlogPostPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
