// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// --- IMPORTS ---
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title GrandmasterChain Secure Protocol
 * @author Saif ur Rehman Siddiqui
 * @notice Trustless chess wagering system with ECDSA signature verification.
 */
contract ChessWager is ReentrancyGuard {
    using ECDSA for bytes32;

    // --- DATA STRUCTURES ---
    struct Game {
        address payable player1;
        address payable player2;
        uint64 creationTime;
        uint96 wagerAmount;
        bool isActive;
        bool isDraw;
        address winner;
    }

    // --- STATE VARIABLES ---
    mapping(uint256 => Game) public games;
    uint256 public gameIdCounter;
    
    uint256 public constant GAME_TIMEOUT = 1 days;

    // --- EVENTS ---
    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager);
    event PlayerJoined(uint256 indexed gameId, address indexed opponent);
    event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout);
    event GameRefunded(uint256 indexed gameId, string reason);

    // --- 1. CREATE GAME ---
    function createGame() external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "Wager must be greater than 0");
        
        gameIdCounter++;
        
        games[gameIdCounter] = Game({
            player1: payable(msg.sender),
            player2: payable(address(0)),
            wagerAmount: uint96(msg.value),
            creationTime: uint64(block.timestamp),
            isActive: true,
            isDraw: false,
            winner: address(0)
        });

        emit GameCreated(gameIdCounter, msg.sender, msg.value);
        return gameIdCounter;
    }

    // --- 2. JOIN GAME ---
    function joinGame(uint256 _gameId) external payable nonReentrant {
        Game storage game = games[_gameId];
        
        // Detailed Error Messages for Debugging
        require(game.isActive, "Error: Game is not active");
        require(game.player2 == address(0), "Error: Game is already full");
        require(msg.sender != game.player1, "Error: Cannot play against yourself");
        require(msg.value == game.wagerAmount, "Error: Incorrect wager amount sent");

        game.player2 = payable(msg.sender);

        emit PlayerJoined(_gameId, msg.sender);
    }

    // --- 3. REPORT WIN (SECURE) ---
    function reportWin(uint256 _gameId, bytes memory _signature) external nonReentrant {
        Game storage game = games[_gameId];
        
        // 1. Validations
        require(game.isActive, "Game already finished");
        // CRITICAL CHECK: This is likely where your error was coming from
        require(game.player2 != address(0), "Game lacks an opponent (Player 2 never joined)");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Unauthorized: Not a player in this game");

        // 2. Identify the Opponent (The one who supposedly signed the loss)
        address loser = (msg.sender == game.player1) ? game.player2 : game.player1;

        // 3. Reconstruct the Signed Message
        bytes32 messageHash = keccak256(abi.encodePacked(_gameId, "loss"));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        
        // 4. Verify Signature
        address signer = ECDSA.recover(ethSignedMessageHash, _signature);
        require(signer == loser, "Invalid signature: Opponent did not sign the defeat message");

        // 5. Update State & Payout
        game.isActive = false;
        game.winner = msg.sender;
        
        uint256 totalPot = uint256(game.wagerAmount) * 2;
        
        // Transfer logic
        (bool success, ) = payable(msg.sender).call{value: totalPot}("");
        require(success, "Transfer failed");

        emit GameEnded(_gameId, msg.sender, totalPot);
    }

    // --- 4. EMERGENCY TIMEOUT ---
    function claimTimeout(uint256 _gameId) external nonReentrant {
        Game storage game = games[_gameId];
        
        require(game.isActive, "Game active or already ended");
        require(block.timestamp > uint256(game.creationTime) + GAME_TIMEOUT, "Timeout not yet reached");

        game.isActive = false;

        if (game.player2 == address(0)) {
            (bool success, ) = game.player1.call{value: game.wagerAmount}("");
            require(success, "Refund failed");
            emit GameRefunded(_gameId, "No opponent joined");
        } 
        else {
            (bool p1Success, ) = game.player1.call{value: game.wagerAmount}("");
            (bool p2Success, ) = game.player2.call{value: game.wagerAmount}("");
            require(p1Success && p2Success, "Refund failed");
            emit GameRefunded(_gameId, "Game abandoned - Refunded");
        }
    }

    // --- HELPER: VIEW GAME DATA ---
    function getGameInfo(uint256 _gameId) external view returns (
        address p1, 
        address p2, 
        uint256 wager, 
        bool active,
        address winnerAddress
    ) {
        Game memory g = games[_gameId];
        return (g.player1, g.player2, g.wagerAmount, g.isActive, g.winner);
    }
}