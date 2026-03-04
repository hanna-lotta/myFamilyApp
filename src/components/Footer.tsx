import './Footer.css';

const Footer = () => {
	return (
		<footer className="parent-footer">
			<p style={{ color: 'rgba(255,255,255,.92)', fontSize: '1rem', margin: '0 0 0.5rem 0', marginBottom: '1rem' }}>Följ oss på sociala medier</p>
			<div style={{ /*width: '40px', height: '2px', background: 'linear-gradient(90deg, transparent, var(--accent1), transparent)', margin: '0.5rem auto' */}}></div>
			<div style={{ display: 'flex', gap: '1.4rem', justifyContent: 'center' }}>
			<a href="https://www.linkedin.com/in/sara-serti-b8b25932b/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent3)', textDecoration: 'none', fontSize: '1rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
			<img src="/images/linkedin_2504923.png" alt="LinkedIn Sara Serti" style={{ width: '27px', height: '27px', marginRight: '0.3rem' }} />
			Sara Serti
			</a>
			<a href="https://www.linkedin.com/in/hanna-seld%C3%A9n-821a3a62/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent3)', textDecoration: 'none', fontSize: '1rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
			<img src="/images/linkedin_2504923.png" alt="LinkedIn Hanna Seldén" style={{ width: '27px', height: '27px', marginRight: '0.3rem' }} />
			Hanna Seldén
			</a>
			</div>
		</footer>
	);
};

export default Footer;
