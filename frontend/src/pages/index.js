import React, { useState, useEffect, useRef } from "react";
// We rely on window.ethers and window.Chess via script injection to avoid bundler errors
import { 
  Trophy, Wallet, History, Activity, 
  Copy, CheckCircle2, Loader2, Zap, PenTool, Lock, RefreshCw, Swords, AlertCircle,
  Move, XCircle, ChevronRight, ShieldCheck, Crown
} from "lucide-react";

// --- CONTRACT CONFIGURATION ---
const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const CONTRACT_ABI = [
  "function createGame() external payable returns (uint256)",
  "function joinGame(uint256 _gameId) external payable",
  "function reportWin(uint256 _gameId, bytes calldata _signature) external",
  "function getGameInfo(uint256 _gameId) external view returns (address p1, address p2, uint256 wager, bool active, address winner)",
  "event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager)",
  "event PlayerJoined(uint256 indexed gameId, address indexed opponent)",
  "event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout)"
];

const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

// --- CUSTOM CHESSBOARD COMPONENT (Styled) ---
const CustomChessboard = ({ game, onMove, orientation = 'white', interactive = true }) => {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);

  // Elegant Unicode Pieces
  const pieces = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
  };

  function getBoard() {
    return game.board(); // Returns 8x8 array or nulls
  }

  function handleSquareClick(rowIndex, colIndex) {
    if (!interactive) return;

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const square = `${files[colIndex]}${ranks[rowIndex]}`;
    
    if (selectedSquare) {
      const moveAttempt = { from: selectedSquare, to: square, promotion: 'q' };
      const result = onMove(moveAttempt); 
      
      if (result) {
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
        }
      }
    } else {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
      }
    }
  }

  const board = getBoard();
  const displayBoard = orientation === 'white' ? board : [...board].reverse().map(row => [...row].reverse());

  return (
    <div className="w-full aspect-square bg-[#1a1b26] rounded-xl overflow-hidden grid grid-cols-8 grid-rows-8 shadow-2xl border border-white/10 relative">
        {/* Board Texture Overlay */}
        <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>

      {displayBoard.map((row, rIdx) => 
        row.map((piece, cIdx) => {
          const actualR = orientation === 'white' ? rIdx : 7 - rIdx;
          const actualC = orientation === 'white' ? cIdx : 7 - cIdx;
          const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
          const square = `${files[actualC]}${ranks[actualR]}`;
          
          const isDark = (actualR + actualC) % 2 === 1;
          const isSelected = selectedSquare === square;
          const isPossibleMove = possibleMoves.includes(square);
          
          // Last move highlighting
          const history = game.history({ verbose: true });
          const lastMove = history.length > 0 ? history[history.length - 1] : null;
          const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

          return (
            <div 
              key={`${rIdx}-${cIdx}`}
              onClick={() => handleSquareClick(actualR, actualC)}
              className={`
                relative flex items-center justify-center text-4xl cursor-pointer transition-all duration-150
                ${isDark ? 'bg-slate-800' : 'bg-slate-200'}
                ${isSelected ? '!bg-amber-500/80 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]' : ''}
                ${isLastMove && !isSelected ? 'after:absolute after:inset-0 after:bg-amber-400/30' : ''}
                hover:opacity-90
              `}
            >
              {/* Coordinates */}
              {actualC === 0 && <span className={`absolute top-0.5 left-1 text-[8px] font-bold opacity-40 ${isDark ? 'text-white' : 'text-black'}`}>{ranks[actualR]}</span>}
              {actualR === 7 && <span className={`absolute bottom-0 right-1 text-[8px] font-bold opacity-40 ${isDark ? 'text-white' : 'text-black'}`}>{files[actualC]}</span>}

              {/* Move Dot */}
              {isPossibleMove && (
                <div className={`absolute w-3 h-3 rounded-full ${piece ? 'bg-red-500 ring-2 ring-red-900' : 'bg-emerald-500/50 backdrop-blur-sm'} z-10 shadow-lg transform scale-100 animate-pulse`}></div>
              )}

              {/* Piece */}
              <span className={`z-20 drop-shadow-2xl select-none transform transition-transform active:scale-95 ${
                piece?.color === 'w' 
                  ? 'text-[#f0f0f0] drop-shadow-[0_2px_1px_rgba(0,0,0,0.8)]' 
                  : 'text-[#0f0f0f] drop-shadow-[0_1px_0px_rgba(255,255,255,0.3)]'
              }`}>
                {piece ? pieces[piece.color][piece.type] : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};

export default function AdvancedChessPlatform() {
  // --- STATE ---
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [game, setGame] = useState(null); 
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("0.0");
  
  // --- HYBRID PROVIDER STATE ---
  const [readContract, setReadContract] = useState(null);
  const [writeContract, setWriteContract] = useState(null);
  const [browserProvider, setBrowserProvider] = useState(null);
  
  const [gameId, setGameId] = useState("");
  const [gameData, setGameData] = useState(null);
  const [loserSignature, setLoserSignature] = useState(null); 
  const [inputGameId, setInputGameId] = useState("");
  const [status, setStatus] = useState("Initializing System...");
  const [statusType, setStatusType] = useState("loading"); 
  const [moveHistory, setMoveHistory] = useState([]);
  
  // --- 0. SCRIPT INJECTION ---
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    const initLibs = async () => {
      try {
        if (!window.ethers) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/ethers/6.11.1/ethers.umd.min.js");
        if (!window.Chess) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js");
        
        setGame(new window.Chess());
        setLibsLoaded(true);
        setStatus("System Ready. Connecting to Network...");
      } catch (err) {
        setStatus("Error loading dependencies. Check internet.");
        setStatusType("error");
      }
    };
    initLibs();
  }, []);

  // --- 1. INITIALIZATION (Read Provider) ---
  useEffect(() => {
    if (!libsLoaded || !window.ethers) return;

    const initReadProvider = async () => {
      try {
        const rProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const rContract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rProvider);
        setReadContract(rContract);
        setupContractListeners(rContract);
        updateStatus("System Ready (Read-Only). Connect Wallet.", "neutral");
      } catch (err) {
        console.error("Local Node Connection Failed:", err);
        updateStatus("Error: Hardhat Node not found at 127.0.0.1:8545", "error");
      }
    };
    initReadProvider();
    return () => { if (readContract) readContract.removeAllListeners(); };
  }, [libsLoaded]);

  // --- 2. HANDLE WALLET ---
  useEffect(() => {
    if (typeof window.ethereum === "undefined" || !libsLoaded) return;

    const handleAccountsChanged = async (newAccounts) => {
      if (newAccounts.length > 0) {
        const newWallet = newAccounts[0];
        setWallet(newWallet);
        
        const newBrowserProvider = new window.ethers.BrowserProvider(window.ethereum);
        const newSigner = await newBrowserProvider.getSigner();
        const newWriteContract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, newSigner);
        
        setBrowserProvider(newBrowserProvider);
        setWriteContract(newWriteContract);

        const newBal = await newBrowserProvider.getBalance(newWallet);
        setBalance(window.ethers.formatEther(newBal));
        updateStatus(`Switched to: ${shortAddr(newWallet)}`, "neutral");

        if (gameId && readContract) fetchGameData(gameId, readContract);
      } else {
        setWallet("");
        setWriteContract(null);
        updateStatus("Wallet Disconnected", "warning");
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }, [gameId, libsLoaded, readContract]);

  // --- 3. EVENT LISTENERS ---
  const setupContractListeners = (contractInstance) => {
    contractInstance.removeAllListeners();
    contractInstance.on("PlayerJoined", (id, opponent) => {
      updateStatus(`Player 2 Joined: ${shortAddr(opponent)}!`, "success");
      fetchGameData(id.toString(), contractInstance); 
    });
    contractInstance.on("GameEnded", (id, winner, amount) => {
      updateStatus(`Game Over! Winner: ${shortAddr(winner)} won ${window.ethers.formatEther(amount)} ETH`, "success");
      setTimeout(() => resetApp(false), 5000); 
    });
  };

  // --- ACTIONS ---
  async function connectWallet() {
    if (!libsLoaded) return;
    if (typeof window.ethereum === "undefined") return updateStatus("MetaMask Required!", "error");
    
    try {
      setStatusType("loading");
      setStatus("Connecting...");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const newBrowserProvider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await newBrowserProvider.getSigner();
      const address = await signer.getAddress();
      const bal = await newBrowserProvider.getBalance(address);
      
      setWallet(address);
      setBalance(window.ethers.formatEther(bal));
      setBrowserProvider(newBrowserProvider);
      setWriteContract(new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
      
      updateStatus("Wallet Connected.", "success");
    } catch (err) {
      updateStatus("Connection Failed.", "error");
    }
  }

  function resetApp(full = true) {
    if (full) setInputGameId("");
    setGameId("");
    setGame(new window.Chess());
    setGameData(null);
    setLoserSignature(null);
    setMoveHistory([]);
    if (full) updateStatus("App Reset. Ready.", "neutral");
  }

  // --- HELPER TO BYPASS METAMASK CACHE ---
  async function getOverrideOptions() {
    const tempProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
    const nonce = await tempProvider.getTransactionCount(wallet, "latest");
    return { nonce: nonce, gasLimit: 500000 };
  }

  async function createGame() {
    if (!writeContract) return updateStatus("Connect Wallet First", "error");
    try {
      updateStatus("Confirm Tx (1 ETH)...", "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.createGame({ 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      updateStatus("Mining...", "loading");
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try { return writeContract.interface.parseLog(log)?.name === "GameCreated"; } 
        catch (e) { return false; }
      });
      
      if (event) {
        const parsedLog = writeContract.interface.parseLog(event);
        const newGameId = parsedLog.args[0].toString();
        setGameId(newGameId);
        setInputGameId(newGameId);
        fetchGameData(newGameId);
        updateStatus(`Match Created! ID: ${newGameId}`, "success");
      }
    } catch (err) { handleError(err); }
  }

  async function joinGame() {
    const targetId = inputGameId || gameId;
    if (!writeContract || !targetId) return updateStatus("Enter Game ID", "error");
    try {
      updateStatus(`Joining Game ${targetId}...`, "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.joinGame(targetId, { 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      updateStatus("Mining...", "loading");
      await tx.wait();
      setGameId(targetId);
      setInputGameId(targetId); 
      fetchGameData(targetId);
      updateStatus("Match Joined! You are Black.", "success");
    } catch (err) { handleError(err); }
  }

  async function fetchGameData(id, specificContract = null) {
    const c = specificContract || readContract;
    if (!c) return;
    try {
      const data = await c.getGameInfo(id);
      setGameData({
        p1: data[0],
        p2: data[1],
        wager: data[2],
        active: data[3],
        winner: data[4]
      });
    } catch (err) { console.error("Fetch Error:", err); }
  }

  function onMove(moveObj) {
    if (!gameId) return false;
    try {
      const tempGame = new window.Chess(game.fen());
      const move = tempGame.move(moveObj);
      if (!move) return false;

      setGame(tempGame);
      setMoveHistory(prev => [...prev, move.san]);
      
      if (tempGame.in_checkmate()) { 
        const turn = tempGame.turn(); 
        const loserAddr = turn === 'w' ? gameData?.p1 : gameData?.p2;
        if (loserAddr && wallet.toLowerCase() === loserAddr.toLowerCase()) {
          updateStatus("Checkmate! You lost. Sign defeat.", "warning");
        } else {
          updateStatus("Victory! Waiting for opponent...", "success");
        }
      }
      return true;
    } catch (e) { return false; }
  }

  async function signDefeat() {
    if (!gameId || !browserProvider) return;
    try {
      updateStatus("Signing Proof of Loss...", "loading");
      const signer = await browserProvider.getSigner(); 
      const messageHash = window.ethers.solidityPackedKeccak256(["uint256", "string"], [gameId, "loss"]);
      const messageBytes = window.ethers.getBytes(messageHash);
      const signature = await signer.signMessage(messageBytes);
      
      setLoserSignature(signature);
      updateStatus("Signed! Switch to Winner to claim.", "success");
    } catch (err) { handleError(err); }
  }

  async function claimPrize() {
    if (!loserSignature || !writeContract) return updateStatus("Error", "error");
    try {
      updateStatus("Claiming Prize...", "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.reportWin(gameId, loserSignature, overrides);
      await tx.wait();
      updateStatus("Payout Confirmed!", "success");
      const bal = await browserProvider.getBalance(wallet);
      setBalance(window.ethers.formatEther(bal));
    } catch (err) { handleError(err); }
  }

  function handleError(err) {
    console.error(err);
    let msg = err.reason || err.message || "Unknown Error";
    if (msg.includes("insufficient funds")) msg = "Insufficient Funds";
    if (msg.includes("user rejected")) msg = "Transaction Rejected";
    updateStatus(`${msg}`, "error");
  }

  function updateStatus(msg, type) {
    setStatus(msg);
    setStatusType(type);
  }

  // --- UI HELPERS ---
  const isPlayer1 = gameData?.p1?.toLowerCase() === wallet.toLowerCase();
  const isGameFull = gameData?.p2 && gameData.p2 !== window.ethers.ZeroAddress;
  const canJoin = wallet && (inputGameId || gameId) && !isPlayer1 && !isGameFull;
  
  let loserAddress = null, winnerAddress = null;
  if (game && game.in_checkmate()) {
    const loserColor = game.turn();
    loserAddress = loserColor === 'w' ? gameData?.p1 : gameData?.p2;
    winnerAddress = loserColor === 'w' ? gameData?.p2 : gameData?.p1;
  }
  const isMyTurnToSign = loserAddress && wallet.toLowerCase() === loserAddress.toLowerCase();
  const isMyTurnToClaim = winnerAddress && wallet.toLowerCase() === winnerAddress.toLowerCase();

  // LOADING SCREEN
  if (!libsLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 animate-pulse"></div>
          <Loader2 className="animate-spin text-amber-500 relative z-10" size={64} />
        </div>
        <p className="font-mono text-sm tracking-widest uppercase opacity-70">Initializing Secure Environment...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 font-sans selection:bg-amber-500/30">
      
      {/* --- NAVBAR --- */}
      <nav className="border-b border-white/5 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-24 flex justify-between items-center">
          
          {/* Logo Area */}
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => resetApp(true)}>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl blur opacity-40 group-hover:opacity-60 transition duration-500"></div>
              <div className="bg-slate-900 border border-white/10 p-3 rounded-xl relative z-10 shadow-xl">
                <Crown size={28} className="text-amber-500" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-none font-display">
                GRANDMASTER<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">CHAIN</span>
              </h1>
              <span className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase mt-1 block">
                Decentralized Elo System
              </span>
            </div>
          </div>

          {/* Right Nav Actions */}
          <div className="flex items-center gap-6">
            <button onClick={() => resetApp(true)} className="p-3 text-slate-500 hover:text-white hover:bg-white/5 rounded-full transition-all duration-300" title="Hard Reset">
              <RefreshCw size={20} />
            </button>
            
            {wallet ? (
              <div className="flex items-center gap-4 bg-slate-900/80 border border-white/10 pr-6 pl-2 py-2 rounded-full shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 bg-gradient-to-r from-slate-800 to-slate-900 border border-white/5 px-4 py-2 rounded-full">
                  <Wallet size={16} className="text-amber-400" />
                  <span className="text-sm font-mono font-bold text-white tracking-tight">{parseFloat(balance).toFixed(4)} ETH</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-[pulse_3s_infinite]"></div>
                  <span className="text-xs font-mono text-slate-400 font-medium tracking-wide">{shortAddr(wallet)}</span>
                </div>
              </div>
            ) : (
              <button 
                onClick={connectWallet} 
                className="group relative px-8 py-3 rounded-xl font-bold text-sm text-slate-950 bg-amber-500 overflow-hidden transition-all hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative flex items-center gap-2">
                  <Zap size={18} fill="currentColor" /> Connect Wallet
                </span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* --- MAIN DASHBOARD --- */}
      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-12 relative">
        {/* Background Decorative Blobs */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[128px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-900/10 rounded-full blur-[128px] pointer-events-none"></div>

        {/* LEFT PANEL: COMMAND CENTER */}
        <div className="w-full lg:w-[380px] flex flex-col gap-6 relative z-10">
          
          {/* Status Feed Card */}
          <div className="relative group">
            <div className={`absolute -inset-0.5 rounded-2xl blur opacity-20 transition duration-500 group-hover:opacity-40 ${
               statusType === 'error' ? 'bg-red-500' :
               statusType === 'success' ? 'bg-emerald-500' :
               'bg-blue-500'
            }`}></div>
            <div className="relative bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className={`mt-1 p-2.5 rounded-xl shadow-inner ${
                   statusType === 'error' ? 'bg-red-500/10 text-red-400' :
                   statusType === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                   'bg-blue-500/10 text-blue-400'
                }`}>
                  {statusType === 'loading' ? <Loader2 size={20} className="animate-spin"/> : 
                   statusType === 'error' ? <AlertCircle size={20}/> : 
                   statusType === 'success' ? <CheckCircle2 size={20}/> :
                   <Activity size={20}/>}
                </div>
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Live Network Feed</h2>
                  <p className="text-sm font-medium text-slate-200 leading-snug">{status}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lobby & Actions Card */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><Swords size={120} /></div>
            
            <div className="flex justify-between items-end border-b border-white/5 pb-4 relative z-10">
               <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">Battle Lobby</h3>
                  <p className="text-xs text-slate-500 mt-1">Join or create a high-stakes match.</p>
               </div>
               <span className="text-[10px] bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full border border-amber-500/20 font-mono font-bold">1.0 ETH STAKE</span>
            </div>

            <div className="space-y-4 relative z-10">
              <button 
                onClick={createGame}
                disabled={!wallet || gameId}
                className="w-full group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:grayscale py-4 rounded-xl font-bold text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-between px-6"
              >
                <span>Create Match</span>
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform"/>
              </button>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Game ID..." 
                  value={inputGameId}
                  onChange={(e) => setInputGameId(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 focus:bg-black/60 outline-none font-mono text-sm transition-all"
                />
                <button 
                  onClick={joinGame}
                  disabled={!canJoin} 
                  className="bg-slate-800 hover:bg-slate-700 border border-white/5 text-white px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  Join
                </button>
              </div>
            </div>

            {gameId && (
               <div className="bg-emerald-950/30 border border-emerald-500/20 p-4 rounded-xl flex flex-col gap-3 relative z-10 animate-in fade-in slide-in-from-top-2">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-emerald-400">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold uppercase tracking-wider">Active Match</span>
                   </div>
                   <button 
                    onClick={() => navigator.clipboard.writeText(gameId)}
                    className="flex items-center gap-2 text-white/50 hover:text-white font-mono font-bold text-xs transition-colors"
                   >
                     {gameId.slice(0,8)}... <Copy size={12}/>
                   </button>
                 </div>
                 
                 {gameData && (
                   <div className="grid grid-cols-2 gap-3 mt-1">
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Player 1 (White)</span>
                        <div className={`text-xs font-mono truncate ${gameData.p1.toLowerCase() === wallet.toLowerCase() ? "text-amber-400" : "text-slate-300"}`}>
                          {shortAddr(gameData.p1)}
                        </div>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Player 2 (Black)</span>
                        <div className={`text-xs font-mono truncate ${gameData.p2 !== window.ethers.ZeroAddress ? "text-slate-300" : "text-slate-600 italic"}`}>
                          {gameData.p2 !== window.ethers.ZeroAddress ? shortAddr(gameData.p2) : "Searching..."}
                        </div>
                      </div>
                   </div>
                 )}
               </div>
            )}
          </div>

          {/* SETTLEMENT PROTOCOL */}
          {(loserSignature || (game && game.in_checkmate())) && (
            <div className="relative group animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
              <div className="relative bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-5 text-amber-500 font-bold text-sm uppercase tracking-wider">
                  <ShieldCheck size={18}/> 
                  <span>Settlement Protocol</span>
                </div>
                <div className="space-y-3">
                  <button 
                    onClick={signDefeat}
                    disabled={loserSignature || !isMyTurnToSign} 
                    className={`w-full py-4 rounded-xl border flex items-center justify-center gap-3 text-sm font-bold transition-all relative overflow-hidden ${
                      loserSignature ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400" : 
                      isMyTurnToSign ? "bg-amber-950/30 border-amber-500/30 text-amber-200 hover:bg-amber-500/10 cursor-pointer" : 
                      "bg-slate-800/50 border-white/5 text-slate-500 cursor-not-allowed opacity-50"
                    }`}
                  >
                    {loserSignature ? <CheckCircle2 size={18}/> : <PenTool size={18}/>}
                    {loserSignature ? "Proof of Loss Signed" : "Sign Defeat (Loser Only)"}
                  </button>

                  <button 
                    onClick={claimPrize}
                    disabled={!loserSignature || !isMyTurnToClaim}
                    className={`w-full py-4 rounded-xl font-bold transition-all shadow-xl flex items-center justify-center gap-2 ${
                      (!loserSignature || !isMyTurnToClaim) 
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed" 
                      : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white transform hover:scale-[1.02]"
                    }`}
                  >
                    <Trophy size={18} className={isMyTurnToClaim ? "animate-bounce" : ""} /> 
                    Claim 2.0 ETH Prize
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: IMMERSIVE BOARD */}
        <div className="w-full lg:flex-1 flex flex-col items-center relative z-10">
          
          {/* Board Container */}
          <div className="relative group w-full max-w-[650px]">
            {/* Ambient Glow */}
            <div className="absolute -inset-1 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-[2rem] blur-xl opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            
            {/* Plinth */}
            <div className="relative bg-slate-900 p-3 rounded-[1.5rem] border border-white/10 shadow-2xl">
              <div className="bg-[#12131a] rounded-2xl p-6 border border-white/5 shadow-inner">
                 <div className="w-full rounded-lg overflow-hidden border-4 border-slate-800 shadow-2xl">
                   <CustomChessboard 
                     game={game} 
                     onMove={onMove}
                     orientation={(!isPlayer1 && gameId) ? 'black' : 'white'}
                   />
                 </div>
              </div>
            </div>
            
            {/* Player Labels on Board Edges (Visual Flair) */}
            <div className="absolute -right-12 top-10 flex flex-col gap-2 opacity-50 hidden xl:flex">
               {['8','7','6','5','4','3','2','1'].map(r => <span key={r} className="font-mono text-xs text-slate-600">{r}</span>)}
            </div>
          </div>
          
          {/* Move History Terminal */}
          <div className="mt-8 w-full max-w-[650px] bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 min-h-[120px] shadow-lg">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <History size={14} className="text-indigo-500"/> Transaction Log
               </h3>
               <span className="text-[10px] font-mono text-slate-600">SYNCED_TO_BLOCKCHAIN</span>
             </div>
             
             <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-mono max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
               {moveHistory.length > 0 ? moveHistory.map((m, i) => (
                 <div key={i} className="flex gap-2 min-w-[4rem]">
                   <span className="text-slate-600 select-none">{Math.ceil((i+1)/2)}.</span>
                   <span className={i % 2 === 0 ? "text-white" : "text-slate-400"}>{m}</span>
                 </div>
               )) : (
                 <div className="w-full h-full flex items-center justify-center opacity-20 text-slate-500 italic">
                   Waiting for first move...
                 </div>
               )}
             </div>
          </div>

        </div>
      </main>
    </div>
  );
}