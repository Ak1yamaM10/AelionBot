interface ShutdownHooks {
  stop: () => void;
  closeWork: () => Array<Promise<unknown>>;
  closeVm: () => Promise<unknown>;
  closeState: () => void;
  exit: () => void;
  report: (error: unknown) => void;
}
export class Shutdown {
  private pending?: Promise<void>;
  constructor(
    private hooks: ShutdownHooks,
    private workTimeoutMs = 8000,
  ) {}
  /**
   * Closes everything and exits. An update installer is already waiting to replace the files and will end the app
   * itself if it takes long, so that exit passes a shorter wait for open work.
   */
  run(workTimeoutMs = this.workTimeoutMs) {
    return (this.pending ??= this.perform(workTimeoutMs));
  }
  private report(error: unknown) {
    try {
      this.hooks.report(error);
    } catch {}
  }
  private async perform(workTimeoutMs: number) {
    const { hooks } = this;
    try {
      hooks.stop();
    } catch (error) {
      this.report(error);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = hooks.closeWork().map((promise) => Promise.resolve(promise).catch((error) => this.report(error)));
      await Promise.race([
        Promise.allSettled(work),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, workTimeoutMs);
        }),
      ]);
    } catch (error) {
      this.report(error);
    } finally {
      if (timer) clearTimeout(timer);
    }
    try {
      await hooks.closeVm();
    } catch (error) {
      this.report(error);
    }
    try {
      hooks.closeState();
    } catch (error) {
      this.report(error);
    } finally {
      hooks.exit();
    }
  }
}
