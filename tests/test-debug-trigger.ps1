Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url": "https://www.woolworths.co.nz/shop/productdetails?stockcode=320675&name=monster-ultra-energy-drink-peachy-keen"}'

  Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url": "https://www.chemistwarehouse.co.nz/buy/106004/isowhey-plant-based-meal-replacement-shake-vanilla-550g"}'

  Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url": "https://www.rockshop.co.nz/line-6-helix-next-generation-amp-modelling-multi-fx-floor-version-99-060-0101"}'

  Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url": "https://www.woolworths.co.nz/shop/productdetails?stockcode=906199&name=penfolds-koonunga-hill-cabernet-sauvignon"}'
