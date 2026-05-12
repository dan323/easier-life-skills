import { CopyButton } from './CopyButton.tsx';

export function QuickStart() {
  return (
    <section class="quickstart" aria-labelledby="quickstart-heading">
      <div class="quickstart-inner">
        <h2 id="quickstart-heading">Get started in 2 steps</h2>
        <p class="quickstart-note">
          Run these commands inside the{' '}
          <a href="https://claude.ai/code" target="_blank" rel="noopener">Claude Code CLI</a>.
        </p>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="step-label">Add this marketplace to Claude Code</div>
              <div class="step-cmd">
                <code>/plugin marketplace add dan323/easier-life-skills</code>
                <CopyButton text="/plugin marketplace add dan323/easier-life-skills" />
              </div>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="step-label">Install any skill — browse below, then run</div>
              <div class="step-cmd">
                <code>{'/plugin install <skill-name>@easier-life-skills'}</code>
                <CopyButton text="/plugin install changelog@easier-life-skills" label="Copy (changelog example)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
