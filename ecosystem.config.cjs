
// PM2 Ecosystem Configuration for AWS EC2
module.exports = {
  apps: [
    {
      name: 'cngbharat-backend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5000 -H 127.0.0.1',
      cwd: '/home/ubuntu/cng-backend',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/home/ubuntu/.pm2/logs/cngbharat-error.log',
      out_file: '/home/ubuntu/.pm2/logs/cngbharat-out.log',
      log_file: '/home/ubuntu/.pm2/logs/cngbharat-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: '13.61.177.95',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/cng.git',
      path: '/home/ubuntu/cng-backend',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': '',
    },
  },
};
