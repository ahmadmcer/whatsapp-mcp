module.exports = {
  apps: [
    {
      name: "whatsapp-mcp",
      script: "dist/index.js",
      cwd: "C:/Users/ahmad/OneDrive/Projects/MCP/whatsapp-mcp",
      args: "--transport http --port 3000",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      restart_delay: 2000,
      max_restarts: 15,
      autorestart: true,
    },
  ],
};
