import { GrimoireServer } from './presentation/gateway';

async function main(): Promise<void> {
  const gateway = new GrimoireServer();

  // Graceful shutdown
  process.on('SIGINT', () => {
    void gateway.shutdown().then(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    void gateway.shutdown().then(() => {
      process.exit(0);
    });
  });

  await gateway.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
