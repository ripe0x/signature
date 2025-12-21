// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/auth/Ownable.sol";
import {Base64} from "solady/utils/Base64.sol";
import {LibString} from "solady/utils/LibString.sol";

import {ILessRenderer} from "./ILessRenderer.sol";

/// @title IScriptyBuilderV2
/// @notice Minimal interface for scripty.sol builder
/// @dev The actual ScriptyBuilderV2 contract may use different function signatures
///      This interface attempts to cover common variations
interface IScriptyBuilderV2 {
    enum HTMLTagType {
        useTagOpenAndClose,
        script,
        scriptBase64DataURI,
        scriptGZIPBase64DataURI,
        scriptPNGBase64DataURI
    }

    struct HTMLTag {
        string name;
        address contractAddress;
        bytes contractData;
        HTMLTagType tagType;
        bytes tagOpen;
        bytes tagClose;
        bytes tagContent;
    }

    struct HTMLRequest {
        HTMLTag[] headTags;
        HTMLTag[] bodyTags;
    }

    function getEncodedHTMLString(
        HTMLRequest memory htmlRequest
    ) external view returns (string memory);
}

/// @title ILess
/// @notice Minimal interface for reading data from the Less NFT contract
interface ILess {
    struct TokenData {
        uint64 windowId;
        bytes32 seed;
    }

    function getSeed(uint256 tokenId) external view returns (bytes32);
    function getTokenData(
        uint256 tokenId
    ) external view returns (TokenData memory);
    function strategy() external view returns (address);
}

/// @title IStrategy
/// @notice Minimal interface for reading strategy supply
interface IStrategy {
    function totalSupply() external view returns (uint256);
}

/// @title LessRenderer
/// @notice Renders metadata and animation_url for Less NFTs using scripty.sol
contract LessRenderer is ILessRenderer, Ownable {
    using LibString for uint256;
    using LibString for bytes32;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MetadataUpdated(
        string collectionName,
        string description,
        string collectionImage,
        string externalLink
    );

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The Less NFT contract
    address public less;

    /// @notice ScriptyBuilderV2 contract address
    address public scriptyBuilder;

    /// @notice ScriptyStorage contract address (where the JS is stored)
    address public scriptyStorage;

    /// @notice Name of the script stored in ScriptyStorage
    string public scriptName;

    /// @notice Base URL for static images (e.g., "https://myserver.com/less/")
    string public baseImageURL;

    /// @notice Collection name for metadata
    string public collectionName;

    /// @notice Project description for metadata
    string public description;

    /// @notice Collection image URL for contract-level metadata
    string public collectionImage;

    /// @notice External link for contract-level metadata
    string public externalLink;

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Configuration for deploying the renderer
    struct RendererConfig {
        address less;
        address scriptyBuilder;
        address scriptyStorage;
        string scriptName;
        string baseImageURL;
        string collectionName;
        string description;
        string collectionImage;
        string externalLink;
        address owner;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param config Renderer configuration struct
    constructor(RendererConfig memory config) {
        less = config.less;
        scriptyBuilder = config.scriptyBuilder;
        scriptyStorage = config.scriptyStorage;
        scriptName = config.scriptName;
        baseImageURL = config.baseImageURL;
        collectionName = config.collectionName;
        description = config.description;
        collectionImage = config.collectionImage;
        externalLink = config.externalLink;

        _initializeOwner(config.owner);
    }

    /*//////////////////////////////////////////////////////////////
                           MAIN ENTRY POINT
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the complete tokenURI as a data URI
    /// @param tokenId The token to generate metadata for
    /// @return A data:application/json;base64,... URI
    function tokenURI(
        uint256 tokenId
    ) external view override returns (string memory) {
        // Get token data from the Less contract
        ILess.TokenData memory token = ILess(less).getTokenData(tokenId);
        bytes32 seed = ILess(less).getSeed(tokenId);

        // Build the metadata JSON
        string memory json = _buildMetadataJSON(tokenId, token, seed);

        // Encode as base64 data URI
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(bytes(json))
                )
            );
    }

    /// @notice Returns the collection-level metadata URI
    /// @return A data:application/json;base64,... URI
    function contractURI() external view override returns (string memory) {
        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                collectionName,
                '","description":"',
                description,
                '","image":"',
                collectionImage,
                '","external_link":"',
                externalLink,
                '"}'
            )
        );

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(bytes(json))
                )
            );
    }

    /*//////////////////////////////////////////////////////////////
                          METADATA BUILDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Builds the complete metadata JSON string
    function _buildMetadataJSON(
        uint256 tokenId,
        ILess.TokenData memory token,
        bytes32 seed
    ) internal view returns (string memory) {
        string memory animationURL = _buildAnimationURL(
            tokenId,
            seed,
            token.windowId
        );
        string memory imageURL = _buildImageURL(tokenId);
        string memory attributes = _buildAttributes(token, seed);

        return
            string(
                abi.encodePacked(
                    '{"name":"',
                    collectionName,
                    " ",
                    tokenId.toString(),
                    '","description":"',
                    description,
                    '","image":"',
                    imageURL,
                    '","animation_url":"',
                    animationURL,
                    '","attributes":',
                    attributes,
                    "}"
                )
            );
    }

    /// @notice Builds the static image URL
    function _buildImageURL(
        uint256 tokenId
    ) internal view returns (string memory) {
        return string(abi.encodePacked(baseImageURL, tokenId.toString()));
    }

    /// @notice Builds the animation_url using scripty.sol
    /// @dev Returns a data:text/html;base64,... URI
    function _buildAnimationURL(
        uint256 tokenId,
        bytes32 seed,
        uint64 windowId
    ) internal view returns (string memory) {
        IScriptyBuilderV2.HTMLRequest memory request = _buildHTMLRequest(
            tokenId,
            seed,
            windowId
        );

        return IScriptyBuilderV2(scriptyBuilder).getEncodedHTMLString(request);
    }

    /// @notice Constructs the HTMLRequest for scripty builder
    function _buildHTMLRequest(
        uint256 tokenId,
        bytes32 seed,
        uint64 windowId
    ) internal view returns (IScriptyBuilderV2.HTMLRequest memory) {
        // Create head tags (inject seed as a global variable)
        IScriptyBuilderV2.HTMLTag[]
            memory headTags = new IScriptyBuilderV2.HTMLTag[](2);

        // Meta viewport for proper scaling
        headTags[0] = IScriptyBuilderV2.HTMLTag({
            name: "",
            contractAddress: address(0),
            contractData: "",
            tagType: IScriptyBuilderV2.HTMLTagType.useTagOpenAndClose,
            tagOpen: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
            tagClose: "",
            tagContent: ""
        });

        // Inject seed, tokenId, and windowId as global JS variables
        headTags[1] = IScriptyBuilderV2.HTMLTag({
            name: "",
            contractAddress: address(0),
            contractData: "",
            tagType: IScriptyBuilderV2.HTMLTagType.useTagOpenAndClose,
            tagOpen: "<script>",
            tagClose: "</script>",
            tagContent: bytes(_buildSeedScript(tokenId, seed, windowId))
        });

        // Create body tags (the main script from storage)
        IScriptyBuilderV2.HTMLTag[]
            memory bodyTags = new IScriptyBuilderV2.HTMLTag[](1);

        bodyTags[0] = IScriptyBuilderV2.HTMLTag({
            name: scriptName,
            contractAddress: scriptyStorage,
            contractData: "",
            tagType: IScriptyBuilderV2.HTMLTagType.script,
            tagOpen: "",
            tagClose: "",
            tagContent: ""
        });

        return
            IScriptyBuilderV2.HTMLRequest({
                headTags: headTags,
                bodyTags: bodyTags
            });
    }

    /// @notice Builds the inline script that sets global seed/tokenId/windowId variables
    function _buildSeedScript(
        uint256 tokenId,
        bytes32 seed,
        uint64 windowId
    ) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "window.LESS_TOKEN_ID=",
                    tokenId.toString(),
                    ';window.LESS_SEED="',
                    _bytes32ToHexString(seed),
                    '";window.FOLD_COUNT=',
                    uint256(windowId).toString(),
                    ";"
                )
            );
    }

    /// @notice Builds the attributes array for metadata
    function _buildAttributes(
        ILess.TokenData memory token,
        bytes32 seed
    ) internal pure returns (string memory) {
        // Build base attributes (always present)
        string memory attrs = string(
            abi.encodePacked(
                '[{"trait_type":"Window","value":',
                uint256(token.windowId).toString(),
                '},{"trait_type":"Fold Count","value":',
                uint256(token.windowId).toString(),
                '},{"trait_type":"Fold Strategy","value":"',
                _getFoldStrategy(seed),
                '"},{"trait_type":"Render Mode","value":"',
                _getRenderMode(seed),
                '"},{"trait_type":"Draw Direction","value":"',
                _getDrawDirection(seed),
                '"},{"trait_type":"Paper Type","value":"',
                _getPaperType(seed),
                '"}'
            )
        );

        // Add Paper Grain (always shown)
        if (_hasPaperGrain(seed)) {
            attrs = string(
                abi.encodePacked(
                    attrs,
                    ',{"trait_type":"Paper Grain","value":"Grain"}'
                )
            );
        } else {
            attrs = string(
                abi.encodePacked(
                    attrs,
                    ',{"trait_type":"Paper Grain","value":"Uniform"}'
                )
            );
        }

        // Add rare traits (only when true)
        if (_hasCreaseLines(seed)) {
            attrs = string(
                abi.encodePacked(
                    attrs,
                    ',{"trait_type":"Crease Lines","value":"Visible"}'
                )
            );
        }

        if (_hasHitCounts(seed)) {
            attrs = string(
                abi.encodePacked(
                    attrs,
                    ',{"trait_type":"Hit Counts","value":"Visible"}'
                )
            );
        }

        if (_hasAnalyticsMode(seed)) {
            attrs = string(
                abi.encodePacked(
                    attrs,
                    ',{"trait_type":"Analytics Mode","value":"Enabled"}'
                )
            );
        }

        // Close the array
        return string(abi.encodePacked(attrs, "]"));
    }

    /// @notice Converts bytes32 to hex string with 0x prefix
    function _bytes32ToHexString(
        bytes32 data
    ) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(66); // 0x + 64 hex chars
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    /*//////////////////////////////////////////////////////////////
                         SEEDED RNG & TRAIT DERIVATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Converts bytes32 seed to JS-compatible number
    /// @dev Matches JS hexSeedToNumber: takes first 64 bits, mods by 0x7fffffff
    function _seedToNumber(bytes32 seed) internal pure returns (uint256) {
        // Take upper 64 bits (first 16 hex chars) and mod by 0x7fffffff
        // This matches JS: Number(BigInt("0x" + hex.slice(0,16)) % BigInt(2147483647))
        uint256 upper64 = uint256(seed) >> 192;
        return upper64 % 0x7fffffff;
    }

    /// @notice LCG random number generator matching JS implementation
    /// @dev Uses unchecked arithmetic to allow overflow (required for LCG)
    function _nextRandom(uint256 state) internal pure returns (uint256) {
        if (state == 0) state = 1;
        unchecked {
            return (state * 1103515245 + 12345) & 0x7fffffff;
        }
    }

    /// @notice Derives fold strategy from seed (matches JS generateFoldStrategy)
    function _getFoldStrategy(
        bytes32 seed
    ) internal pure returns (string memory) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 6666);
        uint256 roll = (state * 100) / 0x7fffffff;
        if (roll < 16) return "Horizontal";
        if (roll < 32) return "Vertical";
        if (roll < 44) return "Diagonal";
        if (roll < 56) return "Radial";
        if (roll < 68) return "Grid";
        if (roll < 80) return "Clustered";
        return "Random";
    }

    /// @notice Derives render mode from seed (matches JS generateRenderMode)
    /// @dev normal 40%, inverted 30%, binary 10%, sparse 10%, dense 10%
    function _getRenderMode(
        bytes32 seed
    ) internal pure returns (string memory) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 5555);
        uint256 roll = (state * 1000000) / 0x7fffffff;
        if (roll < 400000) return "Normal";
        if (roll < 700000) return "Inverted";
        if (roll < 800000) return "Binary";
        if (roll < 900000) return "Sparse";
        return "Dense";
    }

    /// @notice Derives draw direction from seed (matches JS drawDirectionMode)
    function _getDrawDirection(
        bytes32 seed
    ) internal pure returns (string memory) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 33333);
        uint256 roll = (state * 100) / 0x7fffffff;
        if (roll < 22) return "Left to Right";
        if (roll < 44) return "Right to Left";
        if (roll < 65) return "Center";
        if (roll < 80) return "Alternate";
        if (roll < 90) return "Diagonal";
        if (roll < 96) return "Random Mid";
        return "Checkerboard";
    }

    /// @notice Derives paper type from seed (matches JS generatePaperProperties)
    function _getPaperType(bytes32 seed) internal pure returns (string memory) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 5555);
        // absorbency = 0.1 + rng() * 0.8, so range 10-90 when scaled
        uint256 absorbency = ((state * 80) / 0x7fffffff) + 10;
        if (absorbency < 35) return "Resistant";
        if (absorbency < 65) return "Standard";
        return "Absorbent";
    }

    /// @notice Derives paper grain from seed (matches JS generatePaperProperties)
    function _hasPaperGrain(bytes32 seed) internal pure returns (bool) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 5555);
        // First rng() call is for absorbency, second is for hasAngleAffinity
        // intersectionThreshold is disabled in JS (no rng() call)
        state = _nextRandom(state); // hasAngleAffinity check
        uint256 roll = (state * 100) / 0x7fffffff;
        return roll < 40; // 40% have grain
    }

    /// @notice Checks if token has rare crease lines (0.8%)
    function _hasCreaseLines(bytes32 seed) internal pure returns (bool) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 9191);
        return (state * 1000) / 0x7fffffff < 8;
    }

    /// @notice Checks if token has rare hit counts display (0.8%)
    function _hasHitCounts(bytes32 seed) internal pure returns (bool) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 8888);
        return (state * 1000) / 0x7fffffff < 8;
    }

    /// @notice Checks if token has rare analytics mode (0.8%)
    function _hasAnalyticsMode(bytes32 seed) internal pure returns (bool) {
        uint256 state = _nextRandom(_seedToNumber(seed) + 9393);
        return (state * 1000) / 0x7fffffff < 8;
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the Less NFT contract address
    function setLessContract(address _less) external onlyOwner {
        less = _less;
    }

    /// @notice Update the base image URL
    function setBaseImageURL(string memory _baseImageURL) external onlyOwner {
        baseImageURL = _baseImageURL;
    }

    /// @notice Update all metadata fields at once
    /// @param _collectionName Collection name (e.g., "LESS")
    /// @param _description Project description
    /// @param _collectionImage Full URL to collection image
    /// @param _externalLink External website URL
    function setMetadata(
        string memory _collectionName,
        string memory _description,
        string memory _collectionImage,
        string memory _externalLink
    ) external onlyOwner {
        collectionName = _collectionName;
        description = _description;
        collectionImage = _collectionImage;
        externalLink = _externalLink;
        emit MetadataUpdated(
            _collectionName,
            _description,
            _collectionImage,
            _externalLink
        );
    }
}
