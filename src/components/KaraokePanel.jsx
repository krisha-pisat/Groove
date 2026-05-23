import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, MicOff, Volume2, Search, Star, Play, Users } from "lucide-react";

const KaraokePanel = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSong, setSelectedSong] = useState(null);

  const karaokeSongs = [
    {
      id: "1",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      difficulty: 5,
      duration: "5:55",
      genre: "Rock",
      popularity: 95
    },
    {
      id: "2",
      title: "Sweet Caroline",
      artist: "Neil Diamond",
      difficulty: 2,
      duration: "3:21",
      genre: "Pop",
      popularity: 88
    },
    {
      id: "3",
      title: "Yesterday",
      artist: "The Beatles",
      difficulty: 3,
      duration: "2:05",
      genre: "Pop",
      popularity: 92
    },
    {
      id: "4",
      title: "I Will Survive",
      artist: "Gloria Gaynor",
      difficulty: 3,
      duration: "7:37",
      genre: "Disco",
      popularity: 85
    },
    {
      id: "5",
      title: "Don't Stop Believin'",
      artist: "Journey",
      difficulty: 4,
      duration: "4:09",
      genre: "Rock",
      popularity: 90
    }
  ];

  const karaokeQueue = [
    { user: "Alex", song: "Sweet Caroline", waitTime: "2 min" },
    { user: "Jordan", song: "Yesterday", waitTime: "8 min" },
    { user: "Sam", song: "I Will Survive", waitTime: "11 min" }
  ];

  const filteredSongs = karaokeSongs.filter(song => 
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDifficultyColor = (difficulty) => {
    if (difficulty <= 2) return "text-green-500";
    if (difficulty <= 3) return "text-yellow-500";
    return "text-red-500";
  };

  const getDifficultyText = (difficulty) => {
    if (difficulty <= 2) return "Easy";
    if (difficulty <= 3) return "Medium";
    return "Hard";
  };

  return (
    <div className="space-y-6">
      {/* Karaoke Status */}
      <Card className="bg-muted/30 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-gradient-primary rounded-full flex items-center justify-center">
                <Mic className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Karaoke Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Currently: <span className="text-primary font-medium">Available</span>
                </p>
              </div>
            </div>
            <Button
              variant={isRecording ? "destructive" : "hero"}
              onClick={() => setIsRecording(!isRecording)}
              className="flex items-center gap-2"
            >
              {isRecording ? <><MicOff className="w-4 h-4" /><span>Stop</span></> : <><Mic className="w-4 h-4" /><span>Start Singing</span></>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Song Library */}
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-foreground mb-2">Song Library</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search songs or artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-input border-border"
              />
            </div>
          </div>

          <ScrollArea className="h-80">
            <div className="space-y-2">
              {filteredSongs.map((song) => (
                <Card 
                  key={song.id} 
                  className={`bg-muted/20 border-border cursor-pointer hover:bg-muted/30 transition-colors ${
                    selectedSong && selectedSong.id === song.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedSong(song)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium text-foreground truncate">
                            {song.title}
                          </h5>
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${
                                  i < Math.floor(song.popularity / 20) 
                                    ? 'text-yellow-500 fill-current' 
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{song.artist}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-xs">
                            {song.genre}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getDifficultyColor(song.difficulty)}`}
                          >
                            {getDifficultyText(song.difficulty)}
                          </Badge>
                          <span className="text-muted-foreground">{song.duration}</span>
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="sm">
                        <Play className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {selectedSong && (
            <Button variant="hero" className="w-full">
              <Mic className="w-4 h-4" />
              Add "{selectedSong.title}" to Queue
            </Button>
          )}
        </div>

        {/* Karaoke Queue */}
        <div className="space-y-4">
          <h4 className="font-semibold text-foreground">Karaoke Queue</h4>
          
          <Card className="bg-muted/20 border-border">
            <CardContent className="p-4">
              {karaokeQueue.length === 0 ? (
                <div className="text-center py-8">
                  <Mic className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No one in queue</p>
                  <p className="text-sm text-muted-foreground">Be the first to sing!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {karaokeQueue.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="w-8 h-8 p-0 flex items-center justify-center">
                          {index + 1}
                        </Badge>
                        <div>
                          <p className="font-medium text-foreground">{item.user}</p>
                          <p className="text-sm text-muted-foreground">{item.song}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        ~{item.waitTime}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Karaoke Controls */}
          <Card className="bg-muted/20 border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Audio Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Microphone</span>
                <Button variant="outline" size="sm">
                  <Volume2 className="w-4 h-4" />
                  Test Mic
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Voice Effects</span>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Backing Track</span>
                <Button variant="outline" size="sm">
                  <Users className="w-4 h-4" />
                  Enable
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default KaraokePanel; 