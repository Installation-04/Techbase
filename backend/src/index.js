const { app, init } = require('./app');

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await init();
    console.log('Database connected');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
});
