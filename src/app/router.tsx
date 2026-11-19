import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { ActivityPage } from '../pages/ActivityPage'
import { TagsPage } from '../pages/TagsPage'
import { CalendarPage } from '../pages/CalendarPage'
import { ReportPage } from '../pages/ReportPage'
import { ReviewPage } from '../pages/ReviewPage'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { OnboardingPage } from '../pages/onboarding/OnboardingPage'
import { BillsPage } from '../pages/plan/BillsPage'
import { BudgetPage } from '../pages/plan/BudgetPage'
import { EditLimitsPage } from '../pages/plan/EditLimitsPage'
import { DebtDetailPage } from '../pages/plan/DebtDetailPage'
import { DebtsPage } from '../pages/plan/DebtsPage'
import { GoalDetailPage } from '../pages/plan/GoalDetailPage'
import { GoalsPage } from '../pages/plan/GoalsPage'
import { PlanPage } from '../pages/plan/PlanPage'
import { CategoriesPage } from '../pages/settings/CategoriesPage'
import { QuickItemsPage } from '../pages/settings/QuickItemsPage'
import { ImportPage } from '../pages/settings/ImportPage'
import { PaySettingsPage } from '../pages/settings/PaySettingsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { WalletsPage } from '../pages/WalletsPage'
import { WishlistPage } from '../pages/WishlistPage'
import { WorthItPage } from '../pages/WorthItPage'
import { ActivityOverviewPage } from '../pages/ActivityOverviewPage'
import { CategoryStatsPage } from '../pages/CategoryStatsPage'
import { ItemStatsPage } from '../pages/ItemStatsPage'
import { Layout } from './Layout'
import { Splash } from './StatusScreens'

// The design system page only exists in development builds; this branch is removed from production.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'ui', lazy: async () => ({ Component: (await import('../pages/UiKitPage')).default }) }]
  : []

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    // Shown while a lazy page (Stats) loads when the app is opened on it.
    hydrateFallbackElement: <Splash />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'activity', element: <ActivityOverviewPage /> },
      { path: 'activity/list', element: <ActivityPage /> },
      { path: 'activity/category/:categoryId', element: <CategoryStatsPage /> },
      { path: 'activity/item', element: <ItemStatsPage /> },
      { path: 'activity/tags', element: <TagsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'report', element: <ReportPage /> },
      {
        path: 'plan',
        element: <PlanPage />,
        children: [
          { index: true, element: <Navigate to="budget" replace /> },
          { path: 'budget', element: <BudgetPage /> },
          { path: 'bills', element: <BillsPage /> },
          { path: 'goals', element: <GoalsPage /> },
          { path: 'debts', element: <DebtsPage /> },
        ],
      },
      { path: 'plan/budget/edit', element: <EditLimitsPage /> },
      { path: 'plan/goals/:goalId', element: <GoalDetailPage /> },
      { path: 'plan/debts/:debtId', element: <DebtDetailPage /> },
      // Charts are the biggest part of the app, so Stats loads only when opened.
      { path: 'stats', lazy: async () => ({ Component: (await import('../pages/StatsPage')).StatsPage }) },
      { path: 'wallets', element: <WalletsPage /> },
      // Its chart shares Stats' chart library, so it loads only when opened too.
      { path: 'wallets/net-worth', lazy: async () => ({ Component: (await import('../pages/NetWorthPage')).NetWorthPage }) },
      { path: 'worth-it', element: <WorthItPage /> },
      { path: 'worth-it/wishlist', element: <WishlistPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/money', element: <SettingsPage /> },
      { path: 'settings/privacy', element: <SettingsPage /> },
      { path: 'settings/pay', element: <PaySettingsPage /> },
      { path: 'settings/categories', element: <CategoriesPage /> },
      { path: 'settings/quick-items', element: <QuickItemsPage /> },
      { path: 'settings/import', element: <ImportPage /> },
      // Long text in three languages that most visits never need.
      { path: 'privacy', lazy: async () => ({ Component: (await import('../pages/PrivacyPage')).PrivacyPage }) },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/onboarding/:step?', element: <OnboardingPage /> },
])
