import '../styles/progress-bar.css';

interface ProgressBarProps {
  mode?: 'bootstrap' | 'install';
  gitFiles?: number;
  pythonFiles?: number;
  installCompleted?: number;
  installTotal?: number;
  isVisible?: boolean;
  isComplete?: boolean;
}

export function ProgressBar({
  mode = 'bootstrap',
  gitFiles = 0,
  pythonFiles = 0,
  installCompleted = 0,
  installTotal = 76,
  isVisible = false,
  isComplete = false,
}: ProgressBarProps) {
  if (!isVisible && !isComplete) {
    return null;
  }

  if (mode === 'install') {
    const total = Math.max(installTotal, 1);
    const completed = Math.min(Math.max(installCompleted, 0), total);
    const percent = Math.round((completed / total) * 100);

    return (
      <div className={`progress-bar-container ${isComplete ? 'complete' : ''}`}>
        <div className="progress-details">
          <div className="progress-item install">
            <span className="item-label">Packages</span>
            <span className="item-count">
              {completed.toLocaleString()}
            </span>
            <div className="item-bar">
              <div className="item-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estimated totals (approximate based on typical configurations)
  const estimatedGitTotal = 457;
  const estimatedPythonTotal = 5232;

  const gitPercent = gitFiles > 0 ? Math.min((gitFiles / estimatedGitTotal) * 100, 100) : 0;
  const pythonPercent = pythonFiles > 0 ? Math.min((pythonFiles / estimatedPythonTotal) * 100, 100) : 0;

  return (
    <div className={`progress-bar-container ${isComplete ? 'complete' : ''}`}>
      <div className="progress-details">
        {gitFiles > 0 && (
          <div className="progress-item git">
            <span className="item-label">Git</span>
            <span className="item-count">
              {gitFiles.toLocaleString()} files
            </span>
            <div className="item-bar">
              <div className="item-fill" style={{ width: `${gitPercent}%` }} />
            </div>
          </div>
        )}
        {pythonFiles > 0 && (
          <div className="progress-item python">
            <span className="item-label">Python</span>
            <span className="item-count">
              {pythonFiles.toLocaleString()} files
            </span>
            <div className="item-bar">
              <div className="item-fill" style={{ width: `${pythonPercent}%` }} />
            </div>
          </div>
        )}
      </div>

      {isComplete && (
        <div className="progress-complete">
          <svg className="checkmark" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M17.556 5.005L8 15.56l-4.556-4.556"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Bootstrap Complete</span>
        </div>
      )}
    </div>
  );
}
