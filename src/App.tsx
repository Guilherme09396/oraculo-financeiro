import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Income from "@/pages/Income";
import Expenses from "@/pages/Expenses";
import FutureTransactions from "@/pages/FutureTransactions";
import Goals from "@/pages/Goals";
import Categories from "@/pages/Categories";
import Reports from "@/pages/Reports";
import Assistant from "@/pages/Assistant";
import Cards from "@/pages/Cards";
import SettingsPage from "@/pages/Settings";
import NotFound from "./pages/NotFound";
import InvoiceImport from "./pages/InvoiceImport";

const queryClient = new QueryClient();

const App = () => (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route
                            element={
                                <RequireAuth>
                                    <AppLayout />
                                </RequireAuth>
                            }
                        >
                            <Route path="/" element={<Dashboard />} />
                            <Route
                                path="/transactions"
                                element={<Transactions />}
                            />
                            <Route path="/income" element={<Income />} />
                            <Route path="/expenses" element={<Expenses />} />
                            <Route
                                path="/future"
                                element={<FutureTransactions />}
                            />
                            <Route path="/goals" element={<Goals />} />
                            <Route
                                path="/categories"
                                element={<Categories />}
                            />
                            <Route path="/cards" element={<Cards />} />
                            <Route path="/reports" element={<Reports />} />
                            <Route path="/assistant" element={<Assistant />} />
                            <Route
                                path="/invoice-import"
                                element={<InvoiceImport />}
                            />
                            <Route
                                path="/settings"
                                element={<SettingsPage />}
                            />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </TooltipProvider>
    </QueryClientProvider>
);

export default App;
