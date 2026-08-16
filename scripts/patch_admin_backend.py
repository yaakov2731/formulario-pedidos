from pathlib import Path
p=Path("gas/web_api.gs")
s=p.read_text(encoding="utf-8")
needle="    if (action === 'refreshElaboradosReportSheet') {"
insert="    if (action === 'getAdminFinance') { return json(getAdminFinance_()); }\n"
if "action === 'getAdminFinance'" not in s: s=s.replace(needle,insert+needle)
needle2="    if (data.action === 'saveElaborados'){ return json(saveElaboradosConteo_(data)); }"
insert2="    if (data.action === 'savePurchase')   { return json(saveAdminPurchase_(data)); }\n    if (data.action === 'saveTransfer')   { return json(saveAdminTransfer_(data)); }\n"
if "data.action === 'savePurchase'" not in s: s=s.replace(needle2,needle2+"\n"+insert2.rstrip())
p.write_text(s,encoding="utf-8")
