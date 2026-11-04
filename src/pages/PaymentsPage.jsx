import AccountCard from '../components/AccountCard.jsx';
import { useSettings } from '../settings.jsx';

// Customers: balance owed and every payment transaction on their account.
export default function PaymentsPage() {
  const { settings } = useSettings();
  return (
    <div className="page-stack">
      <header>
        <div className="muted small">Account</div>
        <h1>Payments</h1>
      </header>
      <AccountCard timeFormat={settings.timeFormat} />
    </div>
  );
}
