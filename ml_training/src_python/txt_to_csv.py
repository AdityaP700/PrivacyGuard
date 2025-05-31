import csv
import pandas as pd
import os

def convert_txt_to_csv(input_txt, output_csv):
    """
    Convert a .txt file (one URL per line) to a CSV file with a 'url' header.
    """
    with open(input_txt, 'r') as txt_file:
        urls = [line.strip() for line in txt_file if line.strip()]

    with open(output_csv, 'w', newline='') as csv_file:
        writer = csv.writer(csv_file)\

            
        writer.writerow(['url'])  # header
        for url in urls:
            writer.writerow([url])

def merge_legitimate_with_tranco(legit_txt_path, tranco_csv_path, output_csv_path, tranco_sample_size=5000):
    """
    Merge legitimate URLs from txt file and top domains from Tranco list.
    Save to output CSV.
    """
    # Read legitimate URLs
    with open(legit_txt_path, 'r') as f:
        legit_urls = [line.strip() for line in f if line.strip()]

    legit_df = pd.DataFrame({'url': legit_urls})
    print(f"Loaded {len(legit_df)} legitimate URLs from txt file.")

    # Load Tranco list
    tranco_df = pd.read_csv(tranco_csv_path, header=None, names=['rank', 'domain'])
    tranco_df['url'] = 'http://' + tranco_df['domain']

    # Sample from Tranco list
    tranco_sample = tranco_df.head(tranco_sample_size)[['url']]

    # Merge and deduplicate
    combined_legit = pd.concat([legit_df, tranco_sample], ignore_index=True).drop_duplicates()
    print(f"Total legitimate URLs after merging with Tranco: {len(combined_legit)}")

    # Save
    combined_legit.to_csv(output_csv_path, index=False)
    print(f"Final legitimate_urls.csv saved to {output_csv_path}")

if __name__ == "__main__":
    os.makedirs('datasets', exist_ok=True)

    # Convert phishing URLs
    convert_txt_to_csv('datasets/ieee_phishing_urls.txt', 'datasets/phishing_urls.csv')
    print("Phishing URLs converted to CSV.")

    # Merge legitimate URLs with Tranco
    merge_legitimate_with_tranco(
        legit_txt_path='datasets/ieee_legitimate_urls.txt',
        tranco_csv_path='datasets/top-1m.csv',
        output_csv_path='datasets/legitimate_urls.csv'
    )

    print("All conversions done successfully!")
