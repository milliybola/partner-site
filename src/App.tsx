import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './core/components/Layout';
import ProtectedRoute from './core/components/ProtectedRoute';
import { ToastProvider } from './core/components/ToastProvider';
import { ConfirmProvider } from './core/components/ConfirmProvider';
import { RejectReasonProvider } from './core/components/RejectReasonProvider';
import { LoadingState } from './core/ui';
import { isCashier, isManager } from './core/lib/session';
import { getWorkMode, posHome } from './core/lib/workMode';
import LoginPage from './features/auth/pages/LoginPage';
import { useVenue } from './venues';
import { VenueOnly } from './venues/VenueOnly';
import { FeatureGate } from './core/components/FeatureGate';

// Route-level code splitting keeps the first load small on phones.
const OrdersPage = lazy(() => import('./features/orders/pages/OrdersPage'));
const CatalogPage = lazy(() => import('./features/catalog/pages/CatalogPage'));
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage'));
const SettingsPage = lazy(() => import('./features/profile/pages/SettingsPage'));
const BranchesPage = lazy(() => import('./features/profile/pages/BranchesPage'));
const AllOrdersPage = lazy(() => import('./features/orders/pages/AllOrdersPage'));
const CreateOrderPage = lazy(() => import('./features/orders/pages/CreateOrderPage'));
const StaffPage = lazy(() => import('./features/staff/pages/StaffPage'));
const ShiftPage = lazy(() => import('./features/shifts/pages/ShiftPage'));
const TablesPage = lazy(() => import('./features/tables/pages/TablesPage'));
const DeliveryZonesPage = lazy(() => import('./features/delivery-zones/pages/DeliveryZonesPage'));
const PromotionsPage = lazy(() => import('./features/promotions/pages/PromotionsPage'));
const PlanPage = lazy(() => import('./features/profile/pages/PlanPage'));
const ReportsPage = lazy(() => import('./features/reports/pages/ReportsPage'));
const BranchOverviewPage = lazy(() => import('./features/branches/pages/BranchOverviewPage'));

// Restoran va do'kon uchun alohida bo'limlar (src/venues)
const RestaurantHomePage = lazy(() => import('./venues/restaurant/pages/RestaurantHomePage'));
const KitchenPage = lazy(() => import('./venues/restaurant/pages/KitchenPage'));
const StoreHomePage = lazy(() => import('./venues/store/pages/StoreHomePage'));
const InventoryPage = lazy(() => import('./venues/store/pages/InventoryPage'));
const WarehousePage = lazy(() => import('./features/warehouse/pages/WarehousePage'));
const PickingPage = lazy(() => import('./venues/store/pages/PickingPage'));

/** Owner-only screens: managers were able to open them by typing the URL. */
const OwnerOnly: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isCashier() ? <Navigate to={posHome()} replace /> : isManager() ? <Navigate to="/orders" replace /> : children;

/** Boshqaruv bo'limlari (menyu, xodimlar, tarif…): kassir kira olmaydi — kassaga qaytariladi. */
const ManageOnly: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isCashier() ? <Navigate to={posHome()} replace /> : children;

/** `/` — hamkor turiga mos bosh sahifa; kassa rejimida — kassa, menejer — navbat. */
const VenueHome: React.FC = () => {
  const { isStore } = useVenue();
  if (getWorkMode() === 'pos') return <Navigate to={posHome()} replace />;
  if (isManager()) return <Navigate to="/orders" replace />;
  return isStore ? <StoreHomePage /> : <RestaurantHomePage />;
};

const page = (el: React.ReactElement) => <Suspense fallback={<LoadingState className="min-h-[50vh]" />}>{el}</Suspense>;

const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
      <RejectReasonProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={page(<VenueHome />)} />
              <Route path="overview" element={<OwnerOnly>{page(<BranchOverviewPage />)}</OwnerOnly>} />
              <Route path="reports" element={<OwnerOnly>{page(<ReportsPage />)}</OwnerOnly>} />
              {/* eski havolalar: Statistika va Moliya endi «Hisobotlar» ichida */}
              <Route path="statistics" element={<Navigate to="/reports" replace />} />
              <Route path="warehouse" element={<ManageOnly><VenueOnly kind="restaurant">{page(<WarehousePage />)}</VenueOnly></ManageOnly>} />
              <Route path="kitchen" element={<VenueOnly kind="restaurant">{page(<KitchenPage />)}</VenueOnly>} />
              <Route path="inventory" element={<ManageOnly><VenueOnly kind="store">{page(<InventoryPage />)}</VenueOnly></ManageOnly>} />
              <Route path="picking" element={<VenueOnly kind="store">{page(<PickingPage />)}</VenueOnly>} />
              <Route path="orders" element={page(<OrdersPage />)} />
              <Route path="new-order" element={page(<CreateOrderPage />)} />
              <Route path="catalog" element={<ManageOnly>{page(<CatalogPage />)}</ManageOnly>} />
              <Route path="promotions" element={<ManageOnly>{page(<PromotionsPage />)}</ManageOnly>} />
              <Route path="finance" element={<Navigate to="/reports?tab=finance" replace />} />
              <Route path="branches" element={<OwnerOnly>{page(<BranchesPage />)}</OwnerOnly>} />
              <Route path="delivery-zones" element={<OwnerOnly>{page(<DeliveryZonesPage />)}</OwnerOnly>} />
              <Route path="profile" element={<ManageOnly>{page(<ProfilePage />)}</ManageOnly>} />
              <Route path="settings" element={page(<SettingsPage />)} />
              <Route path="plan" element={<ManageOnly>{page(<PlanPage />)}</ManageOnly>} />
              <Route path="all-orders" element={page(<AllOrdersPage />)} />
              <Route path="staff" element={<ManageOnly>{page(<StaffPage />)}</ManageOnly>} />
              <Route path="couriers" element={<ManageOnly>{page(<StaffPage initialTab="couriers" />)}</ManageOnly>} />
              <Route path="shift" element={page(<ShiftPage />)} />
              <Route path="tables" element={<VenueOnly kind="restaurant"><FeatureGate feature="dine_in">{page(<TablesPage key="tables" />)}</FeatureGate></VenueOnly>} />
              <Route path="tables/qr" element={<ManageOnly><VenueOnly kind="restaurant"><FeatureGate feature="qr_menu">{page(<TablesPage key="qr" openQr />)}</FeatureGate></VenueOnly></ManageOnly>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </RejectReasonProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
