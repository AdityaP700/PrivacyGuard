import os

phishing_urls = []
legitimate_urls = []

files = [
    'datasets/dephides_small_dataset/val.txt',
    'datasets/dephides_small_dataset/test.txt',
    'datasets/dephides_small_dataset/train.txt'
]

for file in files:
    if not os.path.exists(file):
        print(f"File not found: {file}")
        continue
    with open(file, 'r') as f:
        for line in f:
            line = line.strip()
            parts = line.split('\t')
            if len(parts) != 2:
                continue
            label, url = parts
            if label.lower() == 'phishing':
                phishing_urls.append(url)
            elif label.lower() == 'legitimate':
                legitimate_urls.append(url)

# Write the collected URLs
with open('datasets\ieee_phishing_urls.txt', 'w') as f:
    for url in phishing_urls:
        f.write(url + '\n')
with open('datasets\ieee_legitimate_urls.txt', 'w') as f:
    for url in legitimate_urls:
        f.write(url + '\n')

print("Done! URLs have been written to the respective files.")
