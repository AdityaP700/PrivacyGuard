import pandas as pd
from urllib.parse import urlparse
import os
import re

def extract_features(input_csv, output_csv, label):
    """
    Extract basic features from URLs for phishing detection.
    """
    df = pd.read_csv(input_csv)
    df['label'] = label

    # Feature extraction logic
    def url_features(url):
        parsed = urlparse(url)
        hostname = parsed.hostname if parsed.hostname else ''
        path = parsed.path if parsed.path else ''
        query = parsed.query if parsed.query else ''

        # Features
        features = {
            'url': url,
            'length': len(url),
            'hostname_length': len(hostname),
            'path_length': len(path),
            'query_length': len(query),
            'num_dots': url.count('.'),
            'num_hyphens': url.count('-'),
            'num_at': url.count('@'),
            'num_question_marks': url.count('?'),
            'num_equals': url.count('='),
            'num_underscore': url.count('_'),
            'num_percent': url.count('%'),
            'num_slash': url.count('/'),
            'has_https': int(url.lower().startswith('https')),
            'has_ip': int(bool(re.search(r'(\d{1,3}\.){3}\d{1,3}', hostname))),
            'num_digits': sum(c.isdigit() for c in url),
            'num_letters': sum(c.isalpha() for c in url),
        }
        return features

    # Apply feature extraction
    feature_rows = [url_features(url) for url in df['url']]
    feature_df = pd.DataFrame(feature_rows)
    feature_df['label'] = label

    feature_df.to_csv(output_csv, index=False)
    print(f"Features extracted and saved to {output_csv}")

if __name__ == "__main__":
    # Ensure output directory exists
    os.makedirs('../processed_data', exist_ok=True)

    # Extract features from phishing URLs
    extract_features(
        input_csv='datasets/phishing_urls.csv',
        output_csv='processed_data/phishing_features.csv',
        label=1
    )

    # Extract features from legitimate URLs
    extract_features(
        input_csv='datasets/legitimate_urls.csv',
        output_csv='processed_data/legitimate_features.csv',
        label=0
    )

    # Combine phishing & legitimate features
    try:
        phishing_df = pd.read_csv('processed_data/phishing_features.csv')
        legit_df = pd.read_csv('processed_data/legitimate_features.csv')

        # Balance dataset: sample up to 25,000 of each
        n_samples_phishing = min(len(phishing_df), 50000)
        n_samples_legit = min(len(legit_df), 50000)

        phishing_df = phishing_df.sample(n=n_samples_phishing, random_state=42)
        legit_df = legit_df.sample(n=n_samples_legit, random_state=42)

        # Combine and shuffle
        combined_df = pd.concat([phishing_df, legit_df], ignore_index=True)
        combined_df = combined_df.sample(frac=1, random_state=42).reset_index(drop=True)

        combined_df.to_csv('processed_data/combined_features_for_training.csv', index=False)
        print(f"Combined dataset saved to ../processed_data/combined_features_for_training.csv with {len(combined_df)} samples.")
        print("Label distribution:\n", combined_df['label'].value_counts())
    except Exception as e:
        print(f"Error combining datasets: {str(e)}")
