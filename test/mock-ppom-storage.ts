export class PPOMStorage {
  async syncMetadata(): Promise<void> {
    return undefined;
  }

  async deleteAllFiles(): Promise<void> {
    throw new Error('some error');
  }

  async readFile(): Promise<void> {
    return undefined;
  }

  async writeFile(): Promise<void> {
    return undefined;
  }
}
