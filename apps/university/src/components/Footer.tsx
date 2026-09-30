import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-shell site-footer__inner">
        <div>
          <strong className="site-footer__wordmark">Pattadar University</strong>
          <p>Property learning and supervised skills paths.</p>
        </div>
        <div className="site-footer__links">
          <Link to="/">Course catalog</Link>
          <Link to="/pathways">Learning pathways</Link>
          <Link to="/credentials">Certificates</Link>
          <Link to="/compliance">Training coverage</Link>
          <Link to="/states">State guides</Link>
          <Link to="/opportunities">Work paths</Link>
          <Link to="/locations">Learning hubs</Link>
        </div>
        <p className="site-footer__legal">Completion downloads are previews. Verified credentials require review and issuance.</p>
      </div>
    </footer>
  );
}
