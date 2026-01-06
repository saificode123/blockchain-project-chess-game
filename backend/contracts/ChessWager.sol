// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ChessWager is ReentrancyGuard {

    // --- DATA STRUCTURES ---
    struct Game {
        address payable player1;
        address payable player2;
        uint64 creationTime;
        uint96 wagerAmount; 
        bool isActive;
        address winner;
    }

    // --- STATE VARIABLES ---
    mapping(uint256 => Game) public games;
    uint256 public gameIdCounter;
    uint256 public constant GAME_TIMEOUT = 1 days;

    // --- EVENTS ---
    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager);
    event PlayerJoined(uint256 indexed gameId, address indexed opponent);
    event MoveMade(uint256 indexed gameId, address player, string moveSan); 
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
            winner: address(0)
        });

        emit GameCreated(gameIdCounter, msg.sender, msg.value);
        return gameIdCounter;
    }

    // --- 2. JOIN GAME ---
    function joinGame(uint256 _gameId) external payable nonReentrant {
        Game storage game = games[_gameId];
        
        require(game.isActive, "Error: Game is not active");
        require(game.player2 == address(0), "Error: Game is already full");
        require(msg.sender != game.player1, "Error: Cannot play against yourself");
        require(msg.value == uint256(game.wagerAmount), "Error: Incorrect wager amount sent");

        game.player2 = payable(msg.sender);

        emit PlayerJoined(_gameId, msg.sender);
    }

    // --- 3. MAKE MOVE (SYNC LOGIC) ---
    function makeMove(uint256 _gameId, string calldata _moveSan) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game not active");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Unauthorized: Not a player");
        emit MoveMade(_gameId, msg.sender, _moveSan);
    }

    // --- 4. REPORT WIN (CLAIM REWARD) ---
    function reportWin(uint256 _gameId, bytes calldata _signature) external nonReentrant {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        
        address payable winner = payable(msg.sender);
        address payable loser;

        // Determine who is who
        if (winner == game.player1) {
            loser = game.player2;
        } else if (winner == game.player2) {
            loser = game.player1;
        } else {
            revert("Unauthorized: You are not a player in this game");
        }

        // Verify Signature
        // The message signed by the loser is keccak256(gameId, "loss")
        // We use encodePacked to match the frontend solidityPackedKeccak256
        bytes32 messageHash = keccak256(abi.encodePacked(_gameId, "loss"));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        address signer = recoverSigner(ethSignedMessageHash, _signature);
        
        require(signer == loser, "Invalid signature: Not signed by the loser");

        // Update State
        game.isActive = false;
        game.winner = winner;

        // Payout (Total Pot = 2 * Wager)
        uint256 payout = uint256(game.wagerAmount) * 2;
        (bool success, ) = winner.call{value: payout}("");
        require(success, "Transfer failed");

        emit GameEnded(_gameId, winner, payout);
    }

    // --- 5. EMERGENCY TIMEOUT ---
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
            // If game started but stalled, refund both
            (bool p1Success, ) = game.player1.call{value: game.wagerAmount}("");
            (bool p2Success, ) = game.player2.call{value: game.wagerAmount}("");
            require(p1Success && p2Success, "Refund failed");
            emit GameRefunded(_gameId, "Game abandoned - Refunded");
        }
    }

    // --- CRYPTOGRAPHY HELPER ---
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // --- VIEW GAME DATA ---
    function getGameInfo(uint256 _gameId) external view returns (
        address p1, 
        address p2, 
        uint256 wager, 
        bool active, 
        address winnerAddress
    ) {
        Game memory g = games[_gameId];
        // Explicit cast from uint96 to uint256 for safety
        return (g.player1, g.player2, uint256(g.wagerAmount), g.isActive, g.winner);
    }
}