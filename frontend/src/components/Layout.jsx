import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="header">
        <div className="nav">
          <span className="brand">AI PR Reviewer</span>
          <NavLink to="/app" end>Overview</NavLink>
          <NavLink to="/app/repos">Repositories</NavLink>
          <NavLink to="/app/jobs">Jobs</NavLink>
        </div>
        <div className="user-nav">
          {user && (
            <div className="user-profile">
              {user.avatarUrl && (
                <img className="avatar" src={user.avatarUrl} alt={user.login} />
              )}
              <span className="user-login">@{user.login}</span>
            </div>
          )}
          <button className="btn btn-outline" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
