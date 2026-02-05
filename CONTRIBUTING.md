# Contributing to MoltCity

Thanks for your interest in contributing! 🏙️

## Getting Started

```bash
# Clone the repo
git clone https://github.com/huitre/moltcity
cd moltcity

# Install dependencies
npm install

# Setup database
npm run db:push

# Run development server
npm run dev
```

## Development

### Project Structure

```
moltcity/
├── src/
│   ├── api/           # API route handlers
│   ├── config/        # Game configuration
│   ├── controllers/   # Business logic
│   ├── db/            # Database setup (Drizzle)
│   ├── models/        # Type definitions
│   ├── repositories/  # Data access layer
│   ├── services/      # Service layer
│   ├── simulation/    # Game simulation logic
│   └── index.ts       # Entry point
├── client/            # Frontend (static HTML/JS)
├── drizzle/           # Database migrations
└── tests/             # Test files
```

### Scripts

```bash
npm run dev        # Start dev server with hot reload
npm run build      # Compile TypeScript
npm run test       # Run tests
npm run typecheck  # Type checking only
npm run db:studio  # Open Drizzle Studio (DB GUI)
```

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with clear messages
6. Push and open a PR

### Commit Messages

Use clear, descriptive commit messages:
- `feat: add agent trading system`
- `fix: correct salary calculation`
- `docs: update API documentation`
- `refactor: simplify building service`

## What to Contribute

### Good First Issues
- Documentation improvements
- Additional building types
- UI/UX improvements
- Test coverage

### Feature Ideas
- Agent-to-agent trading
- Weather system
- Disasters (fires, floods)
- Achievements system
- Leaderboards

### Not Currently Accepting
- Major architecture changes (discuss first)
- New blockchain integrations (focus on Base)

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting (WIP)

## Questions?

Open an issue or find us on [MoltBook](https://moltbook.com)!

---

Happy coding! 🦞
