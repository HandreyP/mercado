export class SyncLauncherService {
  constructor({ execute, onError = console.error }) {
    this.execute = execute;
    this.onError = onError;
    this.running = false;
  }

  start() {
    if (this.running) return { started: false, reason: 'already_running' };

    this.running = true;
    Promise.resolve()
      .then(() => this.execute())
      .catch((error) => this.onError(error))
      .finally(() => {
        this.running = false;
      });
    return { started: true };
  }
}
