/**
 * The interest catalog: hobbies and pursuits the Game Master knows how to
 * build contracts for. Each interest carries:
 *
 *   aliases   words that identify it in free text and quest titles
 *   attribute the attribute it trains
 *   quest     a repeatable quest the GM can suggest
 *   tasks     graded by effort (1 a few minutes · 2 a session · 3 a push)
 *             and by rank (N novice · A adept · E expert), so a first-week
 *             guitarist and a ten-year one get different contracts
 *
 * Anything a player types that isn't in here still works — see interests.ts
 * for the generic fallback.
 */
import type { Attribute } from './constants';

export type InterestRank = 1 | 2 | 3;
export const RANK_NAMES: Record<InterestRank, string> = { 1: 'Novice', 2: 'Adept', 3: 'Expert' };

export interface InterestTask {
  key: string;
  title: string;
  detail?: string;
  effort: 1 | 2 | 3;
  ranks: readonly InterestRank[];
}

export interface InterestDef {
  id: string;
  name: string;
  aliases: readonly string[];
  attribute: Attribute;
  quest: { title: string; pitch: string };
  tasks: readonly InterestTask[];
}

type Row = [effort: 1 | 2 | 3, ranks: string, key: string, title: string, detail?: string];

function def(
  id: string,
  name: string,
  attribute: Attribute,
  aliases: string[],
  quest: [string, string],
  rows: Row[],
): InterestDef {
  return {
    id,
    name,
    attribute,
    aliases,
    quest: { title: quest[0], pitch: quest[1] },
    tasks: rows.map(([effort, ranks, key, title, detail]) => ({
      key: `i-${id}-${key}`,
      title,
      ...(detail ? { detail } : {}),
      effort,
      ranks: [...ranks].map((c) => ({ N: 1, A: 2, E: 3 })[c as 'N' | 'A' | 'E'] as InterestRank),
    })),
  };
}

export const INTEREST_CATALOG: readonly InterestDef[] = [
  /* ── music ── */
  def('guitar', 'Guitar', 'DEX', ['guitar', 'guitarist', 'acoustic', 'ukulele', 'bass guitar', 'fingerstyle', 'riff', 'riffs'], ['Practice guitar for 20 minutes', 'Calluses are just XP you can see.'], [
    [1, 'N', 'chords', 'Switch between two chords 30 times cleanly', 'Pick the pair that trips you up. Slow is fine.'],
    [1, 'NA', 'tune', 'Tune by ear, then play one scale up and down'],
    [1, 'AE', 'lick', 'Learn one new lick and play it in two keys'],
    [2, 'N', 'song', 'Play through one full song start to finish', 'Mistakes allowed. Stopping isn’t.'],
    [2, 'NA', 'rhythm', 'Practice 20 minutes of strumming to a metronome'],
    [2, 'AE', 'scales', 'Run scales across the whole neck for 20 minutes'],
    [2, 'E', 'improv', 'Improvise over a backing track for 30 minutes'],
    [3, 'N', 'barre', 'Spend 20 minutes on barre chords', 'The F chord is a rite of passage. Take it.'],
    [3, 'A', 'learn-song', 'Learn a new song all the way through today'],
    [3, 'AE', 'transcribe', 'Transcribe a solo or riff by ear'],
    [3, 'E', 'record', 'Record a full take of a song and listen back critically'],
  ]),
  def('piano', 'Piano', 'DEX', ['piano', 'keyboard', 'keys', 'pianist'], ['Practice piano for 20 minutes', 'Eighty-eight keys. Start with one.'], [
    [1, 'N', 'notes', 'Name and play every C, F and G on the keyboard'],
    [1, 'NA', 'scale', 'Play one scale hands together, slowly'],
    [1, 'AE', 'sight', 'Sight-read 8 bars of something new'],
    [2, 'N', 'piece', 'Practice your current piece for 20 minutes'],
    [2, 'NA', 'hands', 'Practice the left hand alone for 15 minutes', 'The left hand is usually the one lying about being ready.'],
    [2, 'AE', 'arpeggios', 'Arpeggios in 4 keys, then your repertoire'],
    [3, 'N', 'chords', 'Learn the chords to one song and play along'],
    [3, 'A', 'section', 'Master the hardest 4 bars of a piece at tempo'],
    [3, 'E', 'perform', 'Play a piece start to finish for someone else'],
  ]),
  def('singing', 'Singing', 'CHA', ['singing', 'sing', 'vocals', 'vocal', 'choir', 'karaoke'], ['Do a 15-minute vocal warm-up', 'Your voice is an instrument you never have to carry.'], [
    [1, 'NAE', 'warmup', 'Do a 5-minute vocal warm-up', 'Lip trills, sirens, humming.'],
    [1, 'N', 'pitch', 'Match 10 notes from a piano app'],
    [2, 'N', 'song', 'Sing one song all the way through, out loud'],
    [2, 'NA', 'record', 'Record yourself singing one song and listen back'],
    [2, 'AE', 'range', 'Work on the top of your range for 15 minutes'],
    [3, 'NA', 'learn', 'Learn every word of a new song'],
    [3, 'AE', 'harmony', 'Learn a harmony line to a song you love'],
    [3, 'E', 'perform', 'Sing for someone — live or recorded and shared'],
  ]),
  def('drums', 'Drums', 'DEX', ['drums', 'drum', 'drummer', 'percussion', 'drumming'], ['Practice drums for 20 minutes', 'Hit things. Rhythmically. It counts.'], [
    [1, 'NAE', 'rudiment', 'Play one rudiment to a metronome for 5 minutes'],
    [2, 'N', 'beat', 'Lock in a basic rock beat for 15 minutes straight'],
    [2, 'A', 'fills', 'Practice fills in and out of a groove for 20 minutes'],
    [2, 'E', 'tempo', 'Take one groove 20 BPM faster than yesterday'],
    [3, 'NA', 'song', 'Play along to a full song without stopping'],
    [3, 'AE', 'transcribe', 'Transcribe a drum part by ear'],
  ]),
  def('music-production', 'Music Production', 'DEX', ['music production', 'producing', 'beatmaking', 'beats', 'daw', 'ableton', 'fl studio', 'mixing'], ['Make a beat in 30 minutes', 'Hit export before you hit doubt.'], [
    [1, 'NAE', 'sample', 'Find and save 5 sounds you like'],
    [2, 'N', 'loop', 'Make an 8-bar loop from scratch'],
    [2, 'A', 'sound', 'Design one sound from an init patch'],
    [2, 'E', 'mix', 'Spend 30 minutes mixing one track'],
    [3, 'NA', 'finish', 'Turn a loop into a full-length track'],
    [3, 'E', 'release', 'Export a finished track and share it with someone'],
  ]),

  /* ── art & making ── */
  def('drawing', 'Drawing', 'DEX', ['drawing', 'draw', 'sketch', 'sketching', 'illustration', 'art', 'painting', 'paint'], ['Sketch for 15 minutes', 'Bad drawings are the tax you pay for good ones.'], [
    [1, 'NAE', 'gesture', 'Do 10 one-minute gesture drawings'],
    [1, 'N', 'shapes', 'Fill a page with cubes, cylinders and spheres'],
    [2, 'N', 'still', 'Draw an object in front of you for 20 minutes'],
    [2, 'A', 'study', 'Do a 30-minute study of a piece you admire'],
    [2, 'AE', 'hands', 'Draw 10 hands', 'Nobody likes drawing hands. That’s why it counts.'],
    [3, 'NA', 'piece', 'Finish a full drawing, shading included'],
    [3, 'E', 'original', 'Finish an original piece start to finish'],
  ]),
  def('photography', 'Photography', 'DEX', ['photography', 'photo', 'photos', 'camera', 'photographer'], ['Take 20 intentional photos', 'The light is doing something interesting right now.'], [
    [1, 'NAE', 'one', 'Take one photo you’re proud of today'],
    [2, 'N', 'walk', 'Go on a 30-minute photo walk'],
    [2, 'A', 'constraint', 'Shoot 20 photos using one focal length only'],
    [2, 'AE', 'edit', 'Edit your best 5 shots from this week'],
    [3, 'NA', 'golden', 'Shoot during golden hour'],
    [3, 'E', 'series', 'Shoot a 6-photo series that tells a story'],
  ]),
  def('writing', 'Writing', 'INT', ['writing', 'write', 'writer', 'journal', 'journaling', 'blog', 'poetry', 'novel', 'story'], ['Write 300 words', 'The blank page is bluffing.'], [
    [1, 'NAE', 'line', 'Write one sentence you’re proud of'],
    [1, 'N', 'journal', 'Journal for 10 minutes without stopping'],
    [2, 'N', 'words', 'Write 500 words', 'Quality optional. Quantity mandatory.'],
    [2, 'A', 'scene', 'Write one complete scene or section'],
    [2, 'E', 'edit', 'Edit a piece hard: cut 20% of it'],
    [3, 'NA', 'thousand', 'Write 1,000 words in one sitting'],
    [3, 'E', 'publish', 'Finish a piece and publish or share it'],
  ]),
  def('cooking', 'Cooking', 'DEX', ['cooking', 'cook', 'baking', 'bake', 'chef', 'recipes', 'kitchen'], ['Cook something new this week', 'Crafting skill, but edible.'], [
    [1, 'NAE', 'knife', 'Practice knife cuts on one vegetable'],
    [2, 'N', 'recipe', 'Cook a new recipe from start to finish'],
    [2, 'A', 'no-recipe', 'Cook a meal without following a recipe'],
    [2, 'E', 'technique', 'Nail one technique: a sauce, a dough, a sear'],
    [3, 'NA', 'feed', 'Cook a meal for someone else'],
    [3, 'E', 'menu', 'Plan and cook a three-course meal'],
  ]),
  def('gardening', 'Gardening', 'VIT', ['gardening', 'garden', 'plants', 'plant', 'houseplants'], ['Tend your plants', 'Small green things are counting on you.'], [
    [1, 'NAE', 'water', 'Check and water every plant you own'],
    [2, 'NA', 'repot', 'Repot or prune one plant'],
    [2, 'AE', 'propagate', 'Take a cutting and start propagating it'],
    [3, 'NAE', 'bed', 'Spend an hour on the garden: weeding, planting, planning'],
  ]),

  /* ── mind ── */
  def('rubiks-cube', "Rubik's Cube", 'DEX', ['rubiks', 'rubik', 'cube', 'cubing', 'speedcubing', 'speedcube', '3x3'], ['Do 10 timed solves', 'Twist. Turn. Repeat until it looks like cheating.'], [
    [1, 'N', 'cross', 'Solve the white cross 10 times'],
    [1, 'NA', 'solves', 'Do 5 timed solves and note your average'],
    [1, 'AE', 'lookahead', 'Do 5 slow solves without pausing', 'Slow turning, zero pauses. Lookahead is the whole game.'],
    [2, 'N', 'layer', 'Learn or drill the second-layer algorithms for 20 minutes'],
    [2, 'N', 'solve', 'Solve the cube without looking at a guide'],
    [2, 'A', 'oll', 'Learn 2 new OLL or PLL algorithms'],
    [2, 'AE', 'ao12', 'Do an average of 12 and log it'],
    [3, 'N', 'full', 'Solve it 5 times in a row without help'],
    [3, 'A', 'f2l', 'Spend 30 minutes on intuitive F2L'],
    [3, 'AE', 'pb', 'Beat your personal best average of 5'],
    [3, 'E', 'blind', 'Practice a blindfolded method for 30 minutes'],
  ]),
  def('chess', 'Chess', 'INT', ['chess', 'lichess', 'chess.com'], ['Solve 10 chess puzzles', 'The board rewards patience. So do I.'], [
    [1, 'NAE', 'puzzles', 'Solve 5 chess puzzles'],
    [2, 'N', 'game', 'Play one rapid game and review your mistakes'],
    [2, 'A', 'opening', 'Study one opening line for 20 minutes'],
    [2, 'E', 'endgame', 'Drill one endgame technique for 30 minutes'],
    [3, 'NA', 'classical', 'Play a long game and analyse it move by move'],
    [3, 'AE', 'master', 'Go through one master game, guessing each move'],
  ]),
  def('coding', 'Coding', 'INT', ['coding', 'code', 'programming', 'programmer', 'developer', 'leetcode', 'python', 'javascript', 'software', 'hackathon'], ['Code for 45 focused minutes', 'Ship something small. Then something less small.'], [
    [1, 'NAE', 'kata', 'Solve one small coding exercise'],
    [1, 'N', 'concept', 'Learn one programming concept and write an example'],
    [2, 'N', 'tutorial', 'Follow a tutorial and change one thing in it'],
    [2, 'A', 'feature', 'Build one feature on a side project'],
    [2, 'AE', 'problem', 'Solve one medium algorithm problem'],
    [3, 'NA', 'project', 'Spend 90 minutes on your own project'],
    [3, 'E', 'ship', 'Ship something: a release, a PR, a deploy'],
  ]),
  def('languages', 'Languages', 'INT', ['language', 'languages', 'spanish', 'french', 'german', 'japanese', 'korean', 'hindi', 'duolingo', 'vocabulary'], ['Study a language for 20 minutes', 'Every word is a door. Collect keys.'], [
    [1, 'NAE', 'words', 'Learn 10 new words'],
    [1, 'N', 'app', 'Do one full lesson in your language app'],
    [2, 'NA', 'listen', 'Listen to 20 minutes of content in the language'],
    [2, 'AE', 'write', 'Write a paragraph in the language'],
    [3, 'N', 'grammar', 'Master one grammar point with 20 example sentences'],
    [3, 'AE', 'speak', 'Have a conversation in the language'],
  ]),
  def('math', 'Math & Science', 'INT', ['math', 'maths', 'mathematics', 'physics', 'chemistry', 'science', 'calculus', 'olympiad'], ['Solve 5 problems', 'The universe runs on this. Might as well learn the rules.'], [
    [1, 'NAE', 'problem', 'Solve one problem without looking at the answer'],
    [2, 'NA', 'set', 'Work through a 45-minute problem set'],
    [2, 'AE', 'proof', 'Prove or derive one result from scratch'],
    [3, 'NAE', 'hard', 'Spend an hour on one genuinely hard problem'],
  ]),
  def('reading', 'Reading', 'INT', ['reading', 'read', 'books', 'book', 'novels', 'kindle'], ['Read for 20 minutes', 'Borrow someone else’s brain for a while.'], [
    [1, 'NAE', 'pages', 'Read 10 pages'],
    [2, 'NA', 'chapter', 'Finish a full chapter'],
    [2, 'AE', 'notes', 'Read for 30 minutes and write down 3 takeaways'],
    [3, 'NAE', 'hour', 'Read for an hour, phone in another room'],
  ]),

  /* ── body ── */
  def('running', 'Running', 'STR', ['running', 'runner', 'jogging', 'jog', '5k', '10k', 'marathon'], ['Go for a run', 'Your legs have a quest log too.'], [
    [1, 'NAE', 'mobility', 'Do 10 minutes of running mobility drills'],
    [2, 'N', 'couch', 'Run-walk for 25 minutes', 'One minute on, one minute off. That counts.'],
    [2, 'A', 'easy', 'Easy run for 30 minutes at conversation pace'],
    [2, 'E', 'tempo', 'Tempo run: 20 minutes comfortably hard'],
    [3, 'N', 'nonstop', 'Run 20 minutes without stopping'],
    [3, 'A', 'long', 'Long run: 50% longer than your usual'],
    [3, 'E', 'intervals', 'Do an interval session: 6 × 800 m'],
  ]),
  def('gym', 'Strength Training', 'STR', ['gym', 'lifting', 'weightlifting', 'weights', 'workout', 'calisthenics', 'bodybuilding', 'powerlifting', 'strength'], ['Train at the gym', 'Pick things up. Put them down. Get stronger.'], [
    [1, 'NAE', 'pushups', 'Do 3 sets of push-ups to near failure'],
    [2, 'N', 'full', 'Do a full-body session: squat, push, pull, hinge'],
    [2, 'A', 'split', 'Complete today’s training split in full'],
    [2, 'E', 'accessory', 'Hit the weak-point accessories you usually skip'],
    [3, 'NA', 'overload', 'Add weight or reps to one main lift'],
    [3, 'E', 'pr', 'Attempt a rep PR with good form'],
  ]),
  def('yoga', 'Yoga', 'VIT', ['yoga', 'pilates', 'stretching', 'mobility', 'flexibility'], ['Do a 20-minute yoga flow', 'Bend so you don’t break.'], [
    [1, 'NAE', 'sun', 'Do 3 sun salutations'],
    [2, 'NA', 'flow', 'Follow a 25-minute flow'],
    [2, 'AE', 'balance', 'Spend 15 minutes on balance poses'],
    [3, 'N', 'hour', 'Do a full hour-long class'],
    [3, 'AE', 'pose', 'Work toward one pose you can’t do yet'],
  ]),
  def('cycling', 'Cycling', 'STR', ['cycling', 'bike', 'biking', 'cyclist', 'mtb', 'bicycle'], ['Ride for 30 minutes', 'Two wheels, zero excuses.'], [
    [1, 'NAE', 'check', 'Check tyres, chain and brakes'],
    [2, 'NA', 'ride', 'Ride for 30 minutes'],
    [2, 'E', 'hills', 'Do hill repeats for 30 minutes'],
    [3, 'NA', 'long', 'Go on an hour-long ride somewhere new'],
    [3, 'E', 'century', 'Ride your longest distance this month'],
  ]),
  def('swimming', 'Swimming', 'STR', ['swimming', 'swim', 'swimmer', 'pool', 'laps'], ['Swim laps', 'Low impact. High XP.'], [
    [1, 'NAE', 'breath', 'Practice breathing drills for 10 minutes'],
    [2, 'NA', 'laps', 'Swim 20 minutes of laps'],
    [2, 'AE', 'stroke', 'Drill your weakest stroke for 20 minutes'],
    [3, 'NAE', 'distance', 'Swim your longest continuous distance'],
  ]),
  def('football', 'Football', 'STR', ['football', 'soccer', 'futsal', 'cricket', 'rugby'], ['Train or play football', 'The pitch doesn’t care about your excuses.'], [
    [1, 'NAE', 'juggle', 'Practice keepy-uppies for 10 minutes'],
    [2, 'NA', 'drills', 'Do 30 minutes of ball-control drills'],
    [2, 'AE', 'weak-foot', 'Train only your weak foot for 20 minutes'],
    [3, 'NAE', 'match', 'Play a full match or training session'],
  ]),
  def('basketball', 'Basketball', 'STR', ['basketball', 'hoops', 'nba'], ['Shoot around for 30 minutes', 'Buckets are earned.'], [
    [1, 'NAE', 'handles', 'Do 10 minutes of dribbling drills'],
    [2, 'NA', 'shots', 'Make 100 shots'],
    [2, 'AE', 'free', 'Shoot 50 free throws and log your percentage'],
    [3, 'NAE', 'game', 'Play a full game'],
  ]),
  def('dance', 'Dance', 'DEX', ['dance', 'dancing', 'dancer', 'choreography', 'hip hop', 'salsa', 'ballet'], ['Dance for 20 minutes', 'Nobody is watching. And if they are, they’re jealous.'], [
    [1, 'NAE', 'groove', 'Freestyle to one full song'],
    [2, 'N', 'basics', 'Drill basic steps for 20 minutes'],
    [2, 'AE', 'choreo', 'Learn 8 counts of new choreography'],
    [3, 'NA', 'routine', 'Learn a full short routine'],
    [3, 'E', 'film', 'Film a full routine and review it'],
  ]),

  /* ── spirit & people ── */
  def('meditation', 'Meditation', 'VIT', ['meditation', 'meditate', 'mindfulness', 'breathwork'], ['Meditate for 10 minutes', 'Do nothing. Expertly.'], [
    [1, 'NAE', 'breaths', 'Take 20 slow, counted breaths'],
    [2, 'N', 'ten', 'Meditate for 10 minutes'],
    [2, 'AE', 'twenty', 'Meditate for 20 minutes, unguided'],
    [3, 'NAE', 'walk', 'Go on a 30-minute silent walk, no phone'],
  ]),
  def('public-speaking', 'Public Speaking', 'CHA', ['public speaking', 'speaking', 'speech', 'debate', 'presenting', 'toastmasters', 'podcast'], ['Practice a talk out loud', 'The voice that wins is the one that practised.'], [
    [1, 'NAE', 'story', 'Tell one story out loud in under 2 minutes'],
    [2, 'NA', 'record', 'Record a 3-minute talk and watch it back'],
    [2, 'AE', 'filler', 'Give a 5-minute talk with zero filler words'],
    [3, 'NAE', 'audience', 'Speak in front of real people'],
  ]),
];

export const INTERESTS_BY_ID: Record<string, InterestDef> = Object.fromEntries(INTEREST_CATALOG.map((d) => [d.id, d]));
