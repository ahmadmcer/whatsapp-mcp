module.exports = {
  apps: [
    {
      name: "whatsapp-mcp",
      script: "dist/index.js",
      cwd: "C:/Users/ahmad/OneDrive/Projects/MCP/whatsapp-mcp",
      args: "--port 3000 --host 0.0.0.0",
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
