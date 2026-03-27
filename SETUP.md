# Quick Setup Guide

Fast track to get DataLoom running on your machine.

## Prerequisites

✅ **Node.js** 18.0 or higher  
✅ **RavenDB** instance (Cloud or Self-hosted)  
✅ **Client Certificate** (.pem or .pfx)

## 🚀 Installation (5 minutes)

### 1. Clone Repository

```bash
git clone https://github.com/irivero/portfolio-ravendb-olap-etl-manager.git
#cd dataloom-etl-manager
```

### 2. Install Dependencies

```bash
cd etl-manager
npm install
```

### 3. Start Server

```bash
npm start
```

Open browser: **http://localhost:3000**

## ✨ First Connection

1. Enter your **RavenDB URL**
2. Enter **Database Name**
3. Upload or paste your **Certificate**
4. Click **Connect** → You're in! 🎉

## 📝 Optional: Configure Environment

```bash
# Create .env file (optional for development)
cp .env.example .env

# Edit to enable API key authentication
nano .env
```

## 🎯 Next Steps

- Check [README.md](README.md) for full documentation
- See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines
- Read [CHANGELOG.md](CHANGELOG.md) for version history

## 🆘 Quick Troubleshooting

**Port 3000 already in use?**
```bash
# Windows
Get-NetTCPConnection -LocalPort 3000 | Get-Process
Stop-Process -Id <PID>

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

**Certificate not working?**
- Verify certificate includes private key
- Check certificate is authorized in RavenDB cluster
- Ensure certificate hasn't expired

**Connection fails?**
- Verify RavenDB URL is correct
- Check database name exists
- Test network connectivity to RavenDB

## 📞 Need Help?

- 📖 [Full Documentation](README.md)
- 🐛 [Troubleshooting Guide](README.md#-troubleshooting)
- 💬 [Open an Issue](https://github.com/irivero/portfolio-ravendb-olap-etl-manager/issues)

---

**Ready to weave some data?** 🧵✨
