# Contributing to Cerberus

Thank you for your interest in making AI agent payments safer!

## Getting Started

```bash
git clone <repo-url>
cd cerberus
npm install
npm test
```

## Development

```bash
# Run tests in watch mode
npm test

# Build
npm run build

# Run CLI in dev mode
npm run dev -- report --since 24h
```

## Adding Detectors

1. Create `src/detectors/your-detector.ts`
2. Export a class with an `analyze()` method returning `DetectorResult`
3. Register it in `src/detectors/index.ts`
4. Wire it into `guard.ts`
5. Add tests in `test/detectors.test.ts`

## Policy Changes

Policy YAML schema changes must be backward-compatible. Add new fields as optional with sensible defaults in `policy.ts`.

## Pull Requests

1. Fork and create a feature branch
2. Write tests for new functionality
3. Ensure `npm test` passes
4. Update documentation if needed
5. Open a PR with a clear description

## Code Style

- TypeScript strict mode
- Prefer explicit types over `any`
- Keep modules focused and testable
- Use descriptive error messages in PolicyViolation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
