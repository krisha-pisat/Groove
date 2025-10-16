from flask import Flask, request, jsonify
from flask_cors import CORS
from ytmusicapi import YTMusic
import os

app = Flask(__name__)
CORS(app)

ytmusic = YTMusic()

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('query', '')
    if not query:
        return jsonify([])

    results = ytmusic.search(query, filter='songs', limit=8)
    songs = []

    for result in results:
        if 'videoId' not in result:
            continue
        songs.append({
            'title': result.get('title'),
            'artist': result['artists'][0]['name'] if result.get('artists') else '',
            'album': result['album']['name'] if result.get('album') else '',
            'duration': result.get('duration', '0:00'),
            'videoId': result.get('videoId'),
            'thumbnail': result['thumbnails'][-1]['url'] if result.get('thumbnails') else ''
        })

    return jsonify({'results': songs})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))  # use Cloud Run port if available
    app.run(host="0.0.0.0", port=port)
