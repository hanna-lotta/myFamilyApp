import { useEffect, useMemo, useState } from 'react';
import { getAuthHeader } from '../utils/auth';
import './ParentView.css';

type ParentOverview = {
	totalMinutes: number;
	questionCount: number;
	avgQuizScore: number | null;
	topSubject: string | null;
	sessionsCount: number;
};

type DailyStat = {
	date: string;
	minutes: number;
	questionCount: number;
	avgQuizScore: number | null;
};

type SessionSummary = {
	sessionId: string;
	startedAt: string;
	subject: string;
	durationMinutes: number;
	questionCount: number;
	quizScore: number | null;
};

const mockOverview: ParentOverview = {
	totalMinutes: 145,
	questionCount: 23,
	avgQuizScore: 78,
	topSubject: 'Biologi',
	sessionsCount: 4
};

const mockDailyStats: DailyStat[] = [
	{ date: '2026-02-18', minutes: 20, questionCount: 3, avgQuizScore: 72 },
	{ date: '2026-02-19', minutes: 35, questionCount: 6, avgQuizScore: 80 },
	{ date: '2026-02-20', minutes: 10, questionCount: 2, avgQuizScore: 65 },
	{ date: '2026-02-21', minutes: 50, questionCount: 8, avgQuizScore: 85 },
	{ date: '2026-02-22', minutes: 30, questionCount: 4, avgQuizScore: 78 }
];

const mockSessions: SessionSummary[] = [
	{
		sessionId: 'sess01',
		startedAt: '2026-02-22T09:10:00Z',
		subject: 'Biologi',
		durationMinutes: 35,
		questionCount: 6,
		quizScore: 80
	},
	{
		sessionId: 'sess00',
		startedAt: '2026-02-21T16:30:00Z',
		subject: 'Matematik',
		durationMinutes: 50,
		questionCount: 8,
		quizScore: 85
	}
];

const toDateInputValue = (date: Date): string => date.toISOString().split('T')[0];

const ParentView = () => {
	const today = new Date();
	const lastWeek = new Date();
	lastWeek.setDate(today.getDate() - 6);

	const [fromDate, setFromDate] = useState<string>(toDateInputValue(lastWeek));
	const [toDate, setToDate] = useState<string>(toDateInputValue(today));
	const [overview, setOverview] = useState<ParentOverview | null>(null);
	const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
	const [sessions, setSessions] = useState<SessionSummary[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [usingMock, setUsingMock] = useState(false);

	const maxMinutes = useMemo(() => {
		return Math.max(1, ...dailyStats.map((day) => day.minutes));
	}, [dailyStats]);

	useEffect(() => {
		const fetchOverview = async () => {
			setLoading(true);
			setError(null);
			setUsingMock(false);

			try {
				const authHeader = getAuthHeader();
				const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
				const response = await fetch(`/api/parent/overview?from=${fromDate}&to=${toDate}`, { headers });

				if (!response.ok) {
					throw new Error('Failed to load parent overview');
				}

				const data = await response.json();
				setOverview(data.overview);
				setDailyStats(data.dailyStats || []);
				setSessions(data.recentSessions || []);
			} catch (err) {
				setOverview(mockOverview);
				setDailyStats(mockDailyStats);
				setSessions(mockSessions);
				setUsingMock(true);
				setError('Kunde inte hämta live-data. Visar demo-exempel.');
			} finally {
				setLoading(false);
			}
		};

		fetchOverview();
	}, [fromDate, toDate]);

	return (
		<div className="parent-view">
			<div className="parent-header">
				<div>
					<h2>Föräldraöversikt</h2>
					<p className="parent-subtitle">Sammanfattning av barnets chatthistorik och studiestatistik.</p>
				</div>
				{usingMock && <span className="badge">Demo</span>}
			</div>

			<div className="filters">
				<label>
					Från
					<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
				</label>
				<label>
					Till
					<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
				</label>
				{loading && <span className="status">Laddar...</span>}
				{error && <span className="status error">{error}</span>}
			</div>

			<div className="summary-grid">
				<div className="summary-card">
					<h3>Studietid</h3>
					<p>{overview?.totalMinutes ?? 0} min</p>
					<span>Totalt under perioden</span>
				</div>
				<div className="summary-card">
					<h3>Frågor</h3>
					<p>{overview?.questionCount ?? 0}</p>
					<span>Antal ställda frågor</span>
				</div>
				<div className="summary-card">
					<h3>Quiz</h3>
					<p>{overview?.avgQuizScore ?? '-'}%</p>
					<span>Genomsnittlig poäng</span>
				</div>
				<div className="summary-card">
					<h3>Ämne</h3>
					<p>{overview?.topSubject ?? '—'}</p>
					<span>Mest tränat ämne</span>
				</div>
			</div>

			<div className="panel">
				<h3>Studietid per dag</h3>
				<div className="daily-stats">
					{dailyStats.map((day) => (
						<div key={day.date} className="daily-row">
							<span className="daily-date">{day.date}</span>
							<div className="daily-bar">
								<div
									className="daily-fill"
									style={{ width: `${Math.round((day.minutes / maxMinutes) * 100)}%` }}
								/>
							</div>
							<span className="daily-meta">{day.minutes} min • {day.questionCount} frågor</span>
						</div>
					))}
				</div>
			</div>

			<div className="panel">
				<h3>Senaste sessioner</h3>
				<div className="session-table">
					<div className="session-row session-header">
						<span>Datum</span>
						<span>Ämne</span>
						<span>Tid</span>
						<span>Frågor</span>
						<span>Quiz</span>
					</div>
					{sessions.map((session) => (
						<div key={session.sessionId} className="session-row">
							<span>{new Date(session.startedAt).toLocaleDateString('sv-SE')}</span>
							<span>{session.subject}</span>
							<span>{session.durationMinutes} min</span>
							<span>{session.questionCount}</span>
							<span>{session.quizScore ?? '—'}%</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default ParentView;
