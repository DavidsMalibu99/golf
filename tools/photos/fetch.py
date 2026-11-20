# Downloads the USDA NAIP 2022 aerial photo (public domain, Texas Geographic Information Office)
# for each hole in photos.json into yardage/photos/<course>-<hole>.jpg. Run by
# .github/workflows/fetch-photos.yml (the Texas server can't be reached from everywhere).
import json, os, sys, time, urllib.request
NAIP = "https://imagery.geographic.texas.gov/server/rest/services/NAIP/NAIP22_NCCIR_60cm/ImageServer/exportImage"
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', '..', 'yardage', 'photos')
os.makedirs(out, exist_ok=True)
bad = 0
for p in json.load(open(os.path.join(here, 'photos.json'))):
    url = f"{NAIP}?bbox={p['W']},{p['S']},{p['E']},{p['N']}&bboxSR=4326&imageSR=4326&size={p['pw']},{p['ph']}&format=jpg&bandIds=0,1,2&f=image"
    path = os.path.join(out, f"{p['course']}-{p['hole']}.jpg")
    for attempt in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MSG-Golf-App/1.0 (info@msg-golf.com)'}), timeout=120).read()
            if data[:3] != b'\xff\xd8\xff' or len(data) < 20000: raise ValueError(f'not a photo ({len(data)} bytes)')
            open(path, 'wb').write(data); print(path, len(data)); break
        except Exception as e:
            print('retry', p['course'], p['hole'], e); time.sleep(10)
    else:
        bad += 1
sys.exit(1 if bad else 0)
