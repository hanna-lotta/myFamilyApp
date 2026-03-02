import { useEffect, useState } from 'react';
import useUserStore from '../store/userStore';
import '../components/ParentView.css';
import { useNavigate } from 'react-router';
import { getAuthHeader } from '../utils/auth';

// Typ för stats (kan utökas om backend returnerar mer)
type UserStats = {
  totalMinutes: number;
  questionCount: number;
  avgQuizScore: number | null;
};

const MyProfile = () => {
  const user = useUserStore((s) => s.user);
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [dailyStats, setDailyStats] = useState<{ date: string; minutes: number; questionCount: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todoInput, setTodoInput] = useState('');
  const [todos, setTodos] = useState<string[]>(() => {
    // Ladda från localStorage om det finns
    const saved = localStorage.getItem('myprofile_todos');
    return saved ? JSON.parse(saved) : [];
  });

  // Redirect om inte inloggad
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const authHeader = getAuthHeader();
        const res = await fetch('/api/user/stats', {
          headers: authHeader ? { Authorization: authHeader } : {}
        });
        if (!res.ok) throw new Error('Kunde inte hämta statistik.');
        const data = await res.json();
        setStats(data);
        // Om backend returnerar dailyStats, spara det
        if (data.dailyStats) setDailyStats(data.dailyStats);
      } catch (err) {
        setError('Kunde inte hämta statistik.');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const addTodo = () => {
    if (todoInput.trim()) {
      const updated = [...todos, todoInput.trim()];
      setTodos(updated);
      localStorage.setItem('myprofile_todos', JSON.stringify(updated));
      setTodoInput('');
    }
  };

  const removeTodo = (idx: number) => {
    const updated = todos.filter((_, i) => i !== idx);
    setTodos(updated);
    localStorage.setItem('myprofile_todos', JSON.stringify(updated));
  };

  if (!user) {
    // Navigera bort först när komponenten är "säker" att rendera, inte direkt i render
    useEffect(() => {
      navigate('/');
    }, [navigate]);
    return null;
  }

  return (
    <div className="parent-view" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
      <div className="parent-header">
        <div>
          <h2 className="parent-subtitle">Välkommen, <strong>{user.username}</strong>!</h2>
        </div>
      </div>
      {loading && <span className="status">Laddar statistik...</span>}
      {error && <span className="status error">{error}</span>}
      {stats && (
        <div className="summary-grid" style={{ maxWidth: 600, margin: '2rem auto 1.5rem' }}>
          <div className="summary-card">
            <h3>Studietid</h3>
            <p>{stats.totalMinutes ?? 0} min</p>
            <span>Totalt</span>
          </div>
          <div className="summary-card">
            <h3>Frågor</h3>
            <p>{stats.questionCount ?? 0}</p>
            <span>Antal ställda frågor</span>
          </div>
          <div className="summary-card">
            <h3>Quiz</h3>
            <p>{stats.avgQuizScore ?? '-'}%</p>
            <span>Genomsnittlig poäng</span>
          </div>
        </div>
      )}
      {dailyStats.length > 0 && (
        <div className="panel" style={{ maxWidth: 600, width: '100%', margin: '0 auto 1.5rem' }}>
          <h3>Studietid per dag</h3>
          <div className="daily-stats">
            {dailyStats.map((day) => (
              <div key={day.date} className="daily-row">
                <span className="daily-date">{day.date}</span>
                <div className="daily-bar">
                  <div
                    className="daily-fill"
                    style={{ width: `${Math.round((day.minutes / Math.max(...dailyStats.map(d => d.minutes), 1)) * 100)}%` }}
                  />
                </div>
                <span className="daily-meta">{day.minutes} min • {day.questionCount} frågor</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ToDo-lista */}
      <div className="panel" style={{ maxWidth: 600, width: '100%', margin: '0 auto 2rem' }}>
        <h3>Att göra </h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={todoInput}
            onChange={e => setTodoInput(e.target.value)}
            placeholder='Matteprov fredag'
            style={{
              flex: 1,
              borderRadius: 8,
              border: '1px solid var(--stroke2)',
              padding: '0.5rem',
              background: 'rgba(255,255,255,.05)', 
              color: 'var(--text, #fff)',
              outline: 'none',
              fontSize: '1rem'
            }}
            onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
          />
          <button className="close-session-btn" style={{ minWidth: 80 }} onClick={addTodo}>Lägg till</button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {todos.length === 0 && <li style={{ color: 'rgba(255,255,255,.7)' }}>Inga att göra ännu.</li>}
          {todos.map((todo, idx) => (
            <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 6 }}>
              <span style={{ flex: 1 }}>{todo}</span>
              <button className="close-session-btn" style={{ padding: '0.2rem 0.8rem', fontSize: '0.9rem' }} onClick={() => removeTodo(idx)}>
                Ta bort
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MyProfile;