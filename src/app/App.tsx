import { Redirect, Route, Switch } from 'wouter'
import { AnalyticsPage } from '../features/analytics/AnalyticsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { BackupPage } from '../features/data/BackupPage'
import { PrivacyPage } from '../features/data/PrivacyPage'
import { InboxPage } from '../features/inbox/InboxPage'
import { ReconcilePage } from '../features/reconcile/ReconcilePage'
import { AccountEditPage } from '../features/settings/AccountEditPage'
import { AccountsPage } from '../features/settings/AccountsPage'
import { CategoriesPage } from '../features/settings/CategoriesPage'
import { CategoryEditPage } from '../features/settings/CategoryEditPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TransactionFormPage } from '../features/transactions/TransactionFormPage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { HoldingEditPage } from '../features/wealth/HoldingEditPage'
import { InvestmentsPage } from '../features/wealth/InvestmentsPage'
import { LoanEditPage } from '../features/wealth/LoanEditPage'
import { LoansPage } from '../features/wealth/LoansPage'
import { SubscriptionEditPage } from '../features/wealth/SubscriptionEditPage'
import { SubscriptionsPage } from '../features/wealth/SubscriptionsPage'
import { Layout } from './Layout'

export function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/transactions" component={TransactionsPage} />
        <Route path="/add" component={TransactionFormPage} />
        <Route path="/transactions/:id" component={TransactionFormPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/inbox" component={InboxPage} />
        <Route path="/reconcile" component={ReconcilePage} />
        <Route path="/wealth">
          <Redirect to="/wealth/investments" replace />
        </Route>
        <Route path="/wealth/investments" component={InvestmentsPage} />
        <Route path="/wealth/investments/:id" component={HoldingEditPage} />
        <Route path="/wealth/loans" component={LoansPage} />
        <Route path="/wealth/loans/:id" component={LoanEditPage} />
        <Route path="/wealth/subscriptions" component={SubscriptionsPage} />
        <Route path="/wealth/subscriptions/:id" component={SubscriptionEditPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/settings/data" component={BackupPage} />
        <Route path="/settings/privacy" component={PrivacyPage} />
        <Route path="/settings/categories" component={CategoriesPage} />
        <Route path="/settings/categories/:id" component={CategoryEditPage} />
        <Route path="/settings/accounts" component={AccountsPage} />
        <Route path="/settings/accounts/:id" component={AccountEditPage} />
        <Route>
          <p className="py-16 text-center text-muted">Page not found.</p>
        </Route>
      </Switch>
    </Layout>
  )
}
