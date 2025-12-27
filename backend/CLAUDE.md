# Book Converter Project Guidelines

## Commands
- `npm start` - Start the server
- `npm run add-pages-metadata` - Run the page metadata addition process
- TypeCheck: `npx tsc --noEmit`
- Lint: `npx eslint 'src/**/*.{ts,js}'`
- Format: `npx prettier --write 'src/**/*.{ts,js}'`
- **IMPORTANT**: Always use `tsx` instead of `ts-node` to run TypeScript files

## Code Style
- **TypeScript**: Use strict typing with interfaces/types for all objects
- **Imports**: Order by external libraries, then internal modules
- **Formatting**: Spaces (2), no semicolons (prettier enforced)
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Error Handling**: Use logger service, throw with context for service errors
- **Async**: Use try/catch with proper error logging
- **Logging**: Use the custom logger utility with appropriate log levels

## Project Structure
- Core book conversion logic in root JS files
- TypeScript services in `/src` directory
- Frontend assets in `/public`
- Book content data in `/checkpoints`, `/output`, and `/extracted_content`