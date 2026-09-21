import { Link } from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-shell site-footer__inner">
        <div>
          <strong className="site-footer__wordmark">Pattadar University</strong>
          <p>Property learning, verified skills, and supervised work paths.</p>
        </div>
        <div className="site-footer__links">
          <Link to="/">Course catalog</Link>
          <Link to="/compliance">Training coverage</Link>
          <Link to="/states">State guides</Link>
          <Link to="/opportunities">Work paths</Link>
          <Link to="/locations/hyderabad">Learning centres</Link>
        </div>
        <p className="site-footer__legal">Pattadar credentials are industry learning records unless a course explicitly identifies an external authority.</p>
      </div>
    </footer>
  );
}
