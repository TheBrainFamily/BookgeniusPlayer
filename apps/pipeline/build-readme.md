# Deploy Instructions

This build folder contains everything needed to run the application on a remote server.

## Files and Directories

- `server.js`: The main server application (bundled into a single file)
- `server.js.map`: Source map file for easier debugging
- `public/`: Contains all static assets and client-side files

## Running on a Remote Server

1. Copy this entire `build` folder to your remote server
2. Install Node.js if not already installed (Node.js 16 or higher recommended)
3. Navigate to the build directory:
   ```
   cd path/to/build
   ```
4. Create a `.env` file with the required environment variables (if needed)
5. Run the server:
   ```
   node server.js
   ```
6. The application should now be running at the configured port (default is usually 3000)

## Environment Variables

You may need to set these environment variables in your `.env` file:

```
PORT=3000
# Add other required environment variables here
```

## Troubleshooting

- If you encounter any issues, check the server logs for error messages
- Ensure all required environment variables are set correctly
- Verify that the required ports are not blocked by firewalls
