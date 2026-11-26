import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeading, useToast } from './ui.jsx';
import {
  Action,
  call,
  DataTable,
  Field,
  QueryState,
  useQuery,
} from './workspace-ui.jsx';

const labels = {
  delivered: 'Confirmed deliveries',
  open: 'Unique opens',
  click: 'Unique clicks',
  bounce: 'Bounces',
  unsubscribe: 'Unsubscribes',
  complaint: 'Complaints',
};
const formatNumber = (value) => new Intl.NumberFormat().format(value);
const day = (date) => date.toISOString().slice(0, 10);
const reportTypes = [
  'campaigns',
  'contacts',
  'lists',
  'subscribers',
  'bounces',
  'unsubscribes',
  'smtp',
  'daily',
  'monthly',
  'complaints',
  'queue',
];
const eventColors = {
  submitted: '#3765e9',
  open: '#53a6f3',
  click: '#17a58b',
  bounce: '#e98562',
};

function rangeFor(preset) {
  const now = new Date();
  const from = new Date(now);
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'month') from.setUTCDate(1);
  else from.setUTCDate(now.getUTCDate() - Number(preset) + 1);
  return { from: day(from), to: day(now) };
}

function DateControls({ range, setRange, children }) {
  const [preset, setPreset] = useState('30');
  return (
    <div className="studio-filters">
      <Field label="Date range">
        <select
          value={preset}
          onChange={(event) => {
            setPreset(event.target.value);
            if (event.target.value !== 'custom')
              setRange(rangeFor(event.target.value));
          }}
        >
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="month">This month</option>
          <option value="all">All time</option>
          <option value="custom">Custom range</option>
        </select>
      </Field>
      {preset === 'custom' && (
        <>
          <Field label="From (UTC)">
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </Field>
          <Field label="Through (UTC)">
            <input
              type="date"
              min={range.from}
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
        </>
      )}
      {children}
    </div>
  );
}

export default function Analytics({
  overview = false,
  user,
  navigate,
  canEdit = false,
}) {
  const [range, setRange] = useState(() => rangeFor('30'));
  const [period, setPeriod] = useState('daily');
  const input = useMemo(() => ({ ...range, period }), [range, period]);
  const query = useQuery('analytics', input, 0, 10000);
  const [context, setContext] = useState(null);
  useEffect(() => {
    if (!overview) return;
    let active = true;
    const load = () =>
      Promise.all([
        window.bulkMail.contacts.dashboard(),
        window.bulkMail.smtpAccounts.list(),
        window.bulkMail.campaigns.list(''),
        window.bulkMail.contacts.list({ pageSize: 5 }),
      ])
        .then((results) => {
          if (active) setContext(results);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [overview]);
  const data = query.data;
  const totals = data?.totals || {};
  const counts = data?.counts;
  const rate = (kind) =>
    data.submitted
      ? ((100 * (data.cohort[kind] || 0)) / data.submitted).toFixed(1) + '%'
      : '—';
  const metrics =
    data &&
    (overview
      ? [
          ['Contacts', counts.contacts],
          ['Active subscribers', counts.subscribers],
          ['Lists', counts.lists],
          ['Segments', counts.segments],
          ['Campaigns', counts.campaigns],
          ['SMTP submissions', data.submitted],
          ['Confirmed deliveries', totals.delivered?.unique_count || 0],
          ['Bounces', totals.bounce?.unique_count || 0],
          ['Unsubscribes', totals.unsubscribe?.unique_count || 0],
        ]
      : [
          ['SMTP submissions', data.submitted],
          ...Object.entries(labels).map(([kind, label]) => [
            label,
            totals[kind]?.unique_count || 0,
            rate(kind),
          ]),
        ]);
  const top = data?.campaigns
    .filter((row) => row.open || row.click)
    .sort((a, b) => b.click - a.click || b.open - a.open)
    .slice(0, 5);

  return (
    <div className="studio-page">
      <PageHeading
        title={overview ? 'Dashboard' : 'Campaign analytics'}
        description={
          overview
            ? 'Monitor your audience, sending activity, and campaign performance.'
            : 'SMTP submissions and provider-confirmed delivery events are measured separately. Opens and clicks can include automated activity.'
        }
        actions={
          overview &&
          canEdit && (
            <>
              <Action onClick={() => navigate('contacts', 'add')}>
                Add contact
              </Action>
              <Action primary onClick={() => navigate('campaigns', 'create')}>
                New campaign
              </Action>
            </>
          )
        }
      />
      {overview && (
        <section className="studio-hero">
          <div>
            <p className="studio-kicker">BULK MAIL SENDER PRO</p>
            <h2>Welcome, {user.fullName.split(' ')[0]}.</h2>
            <p>Here’s what’s happening across your campaigns.</p>
          </div>
          <div className="studio-hero-stats">
            <span>{counts?.waiting ?? '—'} in queue</span>
            <span>{counts?.scheduled ?? '—'} scheduled</span>
          </div>
        </section>
      )}
      <DateControls range={range} setRange={setRange}>
        <Field label="Group activity">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        {!overview && (
          <Action onClick={() => navigate('reports')}>Export reports</Action>
        )}
      </DateControls>
      <QueryState query={query} />
      {data && (
        <>
          <section className="studio-metrics">
            {metrics.map(([label, amount, percent]) => (
              <article className="studio-card" key={label}>
                <span>{label}</span>
                <strong>{formatNumber(amount)}</strong>
                {percent && (
                  <small>{percent} of submissions in this range</small>
                )}
              </article>
            ))}
          </section>
          <section className="studio-card">
            <h2>Sending and engagement</h2>
            {data.trend.length ? (
              <div className="studio-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.trend}
                    margin={{ top: 16, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--studio-border)"
                      vertical={false}
                    />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {Object.entries(eventColors).map(([key, color]) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={color}
                        strokeWidth={2}
                        fill={color}
                        fillOpacity={0.12}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="studio-empty">
                Sending and engagement activity will appear here after your
                first campaign.
              </p>
            )}
          </section>
          {!overview && (
            <section className="studio-card">
              <h2>Campaign comparison</h2>
              <DataTable rows={data.campaigns} omit={['id']} />
            </section>
          )}
          {overview && (
            <div className="studio-grid">
              <section className="studio-card">
                <h2>Recent campaigns</h2>
                <DataTable
                  rows={(context?.[2]?.campaigns || [])
                    .slice(0, 5)
                    .map((row) => ({ name: row.name, status: row.status }))}
                />
              </section>
              <section className="studio-card">
                <h2>Top campaigns by engagement</h2>
                <DataTable
                  rows={top?.map(({ name, open, click }) => ({
                    name,
                    opens: open,
                    clicks: click,
                  }))}
                />
              </section>
              <section className="studio-card">
                <h2>SMTP connection status</h2>
                <DataTable
                  rows={(context?.[1]?.accounts || []).map((row) => ({
                    name: row.name,
                    status: row.connectionStatus,
                  }))}
                />
              </section>
              <section className="studio-card">
                <h2>Recent contacts</h2>
                <DataTable
                  rows={(context?.[3]?.contacts || []).map((row) => ({
                    name: row.fullName,
                    status: row.subscriptionStatus,
                  }))}
                />
              </section>
              <section className="studio-card">
                <h2>Scheduled campaigns</h2>
                <DataTable
                  rows={(context?.[2]?.campaigns || [])
                    .filter((row) => row.status === 'scheduled')
                    .slice(0, 6)
                    .map((row) => ({
                      name: row.name,
                      scheduled_for: new Date(row.scheduledAt).toLocaleString(),
                    }))}
                />
              </section>
              <section className="studio-card">
                <h2>Recent activity</h2>
                <DataTable
                  rows={(context?.[0]?.recentActivity || []).map((row) => ({
                    activity: row.description,
                    time: new Date(row.createdAt).toLocaleString(),
                  }))}
                />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Reports({ defaultType = 'campaigns', locked = false }) {
  const [type, setType] = useState(defaultType);
  const [range, setRange] = useState(() => rangeFor('30'));
  const input = useMemo(() => ({ ...range, type }), [range, type]);
  const query = useQuery('report', input);
  const [busy, setBusy] = useState(false);
  const showToast = useToast();
  async function exportFile(format) {
    setBusy(true);
    try {
      const result = await call('exportReport', { ...input, format });
      if (result.ok) showToast('Report exported.');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-page">
      <PageHeading
        title={
          locked
            ? defaultType[0].toUpperCase() + defaultType.slice(1)
            : 'Reports'
        }
        actions={['csv', 'xlsx', 'pdf'].map((format) => (
          <Action
            key={format}
            onClick={() => exportFile(format)}
            disabled={busy || !query.data?.rows.length}
          >
            {format.toUpperCase()}
          </Action>
        ))}
      />
      <DateControls range={range} setRange={setRange}>
        {!locked && (
          <Field label="Report">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {reportTypes.map((item) => (
                <option key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </DateControls>
      <QueryState query={query} />
      {query.data && (
        <section className="studio-card">
          <DataTable rows={query.data.rows} omit={['id']} />
        </section>
      )}
    </div>
  );
}
