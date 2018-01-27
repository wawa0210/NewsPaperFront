


CKEDITOR.dom.range = function( root ) {
	
	this.startContainer = null;

	
	this.startOffset = null;

	
	this.endContainer = null;

	
	this.endOffset = null;

	
	this.collapsed = true;

	var isDocRoot = root instanceof CKEDITOR.dom.document;
	
	this.document = isDocRoot ? root : root.getDocument();

	
	this.root = isDocRoot ? root.getBody() : root;
};

( function() {
	// Updates the "collapsed" property for the given range object.
	function updateCollapsed( range ) {
		range.collapsed = ( range.startContainer && range.endContainer && range.startContainer.equals( range.endContainer ) && range.startOffset == range.endOffset );
	}

	// This is a shared function used to delete, extract and clone the range content.
	//
	// The outline of the algorithm:
	//
	// 1. Normalization. We handle special cases, split text nodes if we can, find boundary nodes (startNode and endNode).
	// 2. Gathering data.
	//   * We start by creating two arrays of boundary nodes parents. You can imagine these arrays as lines limiting
	//   the tree from the left and right and thus marking the part which is selected by the range. The both lines
	//   start in the same node which is the range.root and end in startNode and endNode.
	//   * Then we find min level and max levels. Level represents all nodes which are equally far from the range.root.
	//   Min level is the level at which the left and right boundaries diverged (the first diverged level). And max levels
	//   are how deep the start and end nodes are nested.
	// 3. Cloning/extraction.
	//   * We start iterating over start node parents (left branch) from min level and clone the parent (usually shallow clone,
	//   because we know that it's not fully selected) and its right siblings (deep clone, because they are fully selected).
	//   We iterate over siblings up to meeting end node parent or end of the siblings chain.
	//   * We clone level after level down to the startNode.
	//   * Then we do the same with end node parents (right branch), because it may contains notes we omit during the previous
	//   step, for example if the right branch is deeper then left branch. Things are more complicated here because we have to
	//   watch out for nodes that were already cloned.
	//   * ***Note:** Setting `cloneId` option to `false` for **extraction** works for partially selected elements only.
	//   See range.extractContents to know more.
	// 4. Clean up.
	//   * There are two things we need to do - updating the range position and perform the action of the "mergeThen"
	//   param (see range.deleteContents or range.extractContents).
	//   See comments in mergeAndUpdate because this is lots of fun too.
	function execContentsAction( range, action, docFrag, mergeThen, cloneId ) {
		'use strict';

		range.optimizeBookmark();

		var isDelete = action === 0;
		var isExtract = action == 1;
		var isClone = action == 2;
		var doClone = isClone || isExtract;

		var startNode = range.startContainer;
		var endNode = range.endContainer;

		var startOffset = range.startOffset;
		var endOffset = range.endOffset;

		var cloneStartNode;
		var cloneEndNode;

		var doNotRemoveStartNode;
		var doNotRemoveEndNode;

		var cloneStartText;
		var cloneEndText;

		// Handle here an edge case where we clone a range which is located in one text node.
		// This allows us to not think about startNode == endNode case later on.
		// We do that only when cloning, because in other cases we can safely split this text node
		// and hence we can easily handle this case as many others.
		if ( isClone && endNode.type == CKEDITOR.NODE_TEXT && startNode.equals( endNode ) ) {
			startNode = range.document.createText( startNode.substring( startOffset, endOffset ) );
			docFrag.append( startNode );
			return;
		}

		// For text containers, we must simply split the node and point to the
		// second part. The removal will be handled by the rest of the code.
		if ( endNode.type == CKEDITOR.NODE_TEXT ) {
			// If Extract or Delete we can split the text node,
			// but if Clone (2), then we cannot modify the DOM (#11586) so we mark the text node for cloning.
			if ( !isClone ) {
				endNode = endNode.split( endOffset );
			} else {
				cloneEndText = true;
			}
		} else {
			// If there's no node after the range boundary we set endNode to the previous node
			// and mark it to be cloned.
			if ( endNode.getChildCount() > 0 ) {
				// If the offset points after the last node.
				if ( endOffset >= endNode.getChildCount() ) {
					endNode = endNode.getChild( endOffset - 1 );
					cloneEndNode = true;
				} else {
					endNode = endNode.getChild( endOffset );
				}
			}
			// The end container is empty (<h1>]</h1>), but we want to clone it, although not remove.
			else {
				cloneEndNode = true;
				doNotRemoveEndNode = true;
			}
		}

		// For text containers, we must simply split the node. The removal will
		// be handled by the rest of the code .
		if ( startNode.type == CKEDITOR.NODE_TEXT ) {
			// If Extract or Delete we can split the text node,
			// but if Clone (2), then we cannot modify the DOM (#11586) so we mark
			// the text node for cloning.
			if ( !isClone ) {
				startNode.split( startOffset );
			} else {
				cloneStartText = true;
			}
		} else {
			// If there's no node before the range boundary we set startNode to the next node
			// and mark it to be cloned.
			if ( startNode.getChildCount() > 0 ) {
				if ( startOffset === 0 ) {
					startNode = startNode.getChild( startOffset );
					cloneStartNode = true;
				} else {
					startNode = startNode.getChild( startOffset - 1 );
				}
			}
			// The start container is empty (<h1>[</h1>), but we want to clone it, although not remove.
			else {
				cloneStartNode = true;
				doNotRemoveStartNode = true;
			}
		}

			// Get the parent nodes tree for the start and end boundaries.
		var startParents = startNode.getParents(),
			endParents = endNode.getParents(),
			// Level at which start and end boundaries diverged.
			minLevel = findMinLevel(),
			maxLevelLeft = startParents.length - 1,
			maxLevelRight = endParents.length - 1,
			// Keeps the frag/element which is parent of the level that we are currently cloning.
			levelParent = docFrag,
			nextLevelParent,
			leftNode,
			rightNode,
			nextSibling,
			// Keeps track of the last connected level (on which left and right branches are connected)
			// Usually this is minLevel, but not always.
			lastConnectedLevel = -1;

		// THE LEFT BRANCH.
		for ( var level = minLevel; level <= maxLevelLeft; level++ ) {
			leftNode = startParents[ level ];
			nextSibling = leftNode.getNext();

			// 1.
			// The first step is to handle partial selection of the left branch.

			// Max depth of the left branch. It means that ( leftSibling == endNode ).
			// We also check if the leftNode isn't only partially selected, because in this case
			// we want to make a shallow clone of it (the else part).
			if ( level == maxLevelLeft && !( leftNode.equals( endParents[ level ] ) && maxLevelLeft < maxLevelRight ) ) {
				if ( cloneStartNode ) {
					consume( leftNode, levelParent, false, doNotRemoveStartNode );
				} else if ( cloneStartText ) {
					levelParent.append( range.document.createText( leftNode.substring( startOffset ) ) );
				}
			} else if ( doClone ) {
				nextLevelParent = levelParent.append( leftNode.clone( 0, cloneId ) );
			}

			// 2.
			// The second step is to handle full selection of the content between the left branch and the right branch.

			while ( nextSibling ) {
				// We can't clone entire endParent just like we can't clone entire startParent -
				// - they are not fully selected with the range. Partial endParent selection
				// will be cloned in the next loop.
				if ( nextSibling.equals( endParents[ level ] ) ) {
					lastConnectedLevel = level;
					break;
				}

				nextSibling = consume( nextSibling, levelParent );
			}

			levelParent = nextLevelParent;
		}

		// Reset levelParent, because we reset the level.
		levelParent = docFrag;

		// THE RIGHT BRANCH.
		for ( level = minLevel; level <= maxLevelRight; level++ ) {
			rightNode = endParents[ level ];
			nextSibling = rightNode.getPrevious();

			// Do not process this node if it is shared with the left branch
			// because it was already processed.
			//
			// Note: Don't worry about text nodes selection - if the entire range was placed in a single text node
			// it was handled as a special case at the beginning. In other cases when startNode == endNode
			// or when on this level leftNode == rightNode (so rightNode.equals( startParents[ level ] ))
			// this node was handled by the previous loop.
			if ( !rightNode.equals( startParents[ level ] ) ) {
				// 1.
				// The first step is to handle partial selection of the right branch.

				// Max depth of the right branch. It means that ( rightNode == endNode ).
				// We also check if the rightNode isn't only partially selected, because in this case
				// we want to make a shallow clone of it (the else part).
				if ( level == maxLevelRight && !( rightNode.equals( startParents[ level ] ) && maxLevelRight < maxLevelLeft ) ) {
					if ( cloneEndNode ) {
						consume( rightNode, levelParent, false, doNotRemoveEndNode );
					} else if ( cloneEndText ) {
						levelParent.append( range.document.createText( rightNode.substring( 0, endOffset ) ) );
					}
				} else if ( doClone ) {
					nextLevelParent = levelParent.append( rightNode.clone( 0, cloneId ) );
				}

				// 2.
				// The second step is to handle all left (selected) siblings of the rightNode which
				// have not yet been handled. If the level branches were connected, the previous loop
				// already copied all siblings (except the current rightNode).
				if ( level > lastConnectedLevel ) {
					while ( nextSibling ) {
						nextSibling = consume( nextSibling, levelParent, true );
					}
				}

				levelParent = nextLevelParent;
			} else if ( doClone ) {
				// If this is "shared" node and we are in cloning mode we have to update levelParent to
				// reflect that we visited the node (even though we didn't process it).
				// If we don't do that, in next iterations nodes will be appended to wrong parent.
				//
				// We can just take first child because the algorithm guarantees
				// that this will be the only child on this level. (#13568)
				levelParent = levelParent.getChild( 0 );
			}
		}

		// Delete or Extract.
		// We need to update the range and if mergeThen was passed do it.
		if ( !isClone ) {
			mergeAndUpdate();
		}

		// Depending on an action:
		// * clones node and adds to new parent,
		// * removes node,
		// * moves node to the new parent.
		function consume( node, newParent, toStart, forceClone ) {
			var nextSibling = toStart ? node.getPrevious() : node.getNext();

			// We do not clone if we are only deleting, so do nothing.
			if ( forceClone && isDelete ) {
				return nextSibling;
			}

			// If cloning, just clone it.
			if ( isClone || forceClone ) {
				newParent.append( node.clone( true, cloneId ), toStart );
			} else {
				// Both Delete and Extract will remove the node.
				node.remove();

				// When Extracting, move the removed node to the docFrag.
				if ( isExtract ) {
					newParent.append( node );
				}
			}

			return nextSibling;
		}

		// Finds a level number on which both branches starts diverging.
		// If such level does not exist, return the last on which both branches have nodes.
		function findMinLevel() {
			// Compare them, to find the top most siblings.
			var i, topStart, topEnd,
				maxLevel = Math.min( startParents.length, endParents.length );

			for ( i = 0; i < maxLevel; i++ ) {
				topStart = startParents[ i ];
				topEnd = endParents[ i ];

				// The compared nodes will match until we find the top most siblings (different nodes that have the same parent).
				// "i" will hold the index in the parents array for the top most element.
				if ( !topStart.equals( topEnd ) ) {
					return i;
				}
			}

			// When startNode == endNode.
			return i - 1;
		}

		// Executed only when deleting or extracting to update range position
		// and perform the merge operation.
		function mergeAndUpdate() {
			var commonLevel = minLevel - 1,
				boundariesInEmptyNode = doNotRemoveStartNode && doNotRemoveEndNode && !startNode.equals( endNode );

			// If a node has been partially selected, collapse the range between
			// startParents[ minLevel + 1 ] and endParents[ minLevel + 1 ] (the first diverged elements).
			// Otherwise, simply collapse it to the start. (W3C specs).
			//
			// All clear, right?
			//
			// It took me few hours to truly understand a previous version of this condition.
			// Mine seems to be more straightforward (even if it doesn't look so) and I could leave you here
			// without additional comments, but I'm not that mean so here goes the explanation.
			//
			// We want to know if both ends of the range are anchored in the same element. Really. It's this simple.
			// But why? Because we need to differentiate situations like:
			//
			// <p>foo[<b>x</b>bar]y</p>		(commonLevel = p, maxLL = "foo", maxLR = "y")
			// from:
			// <p>foo<b>x[</b>bar]y</p>		(commonLevel = p, maxLL = "x", maxLR = "y")
			//
			// In the first case we can collapse the range to the left, because simply everything between range's
			// boundaries was removed.
			// In the second case we must place the range after </b>, because <b> was only **partially selected**.
			//
			// * <b> is our startParents[ commonLevel + 1 ]
			// * "y" is our endParents[ commonLevel + 1 ].
			//
			// By now "bar" is removed from the DOM so <b> is a direct sibling of "y":
			// <p>foo<b>x</b>y</p>
			//
			// Therefore it's enough to place the range between <b> and "y".
			//
			// Now, what does the comparison mean? Why not just taking startNode and endNode and checking
			// their parents? Because the tree is already changed and they may be gone. Plus, thanks to
			// cloneStartNode and cloneEndNode, that would be reaaaaly tricky.
			//
			// So we play with levels which can give us the same information:
			// * commonLevel - the level of common ancestor,
			// * maxLevel - 1 - the level of range boundary parent (range boundary is here like a bookmark span).
			// * commonLevel < maxLevel - 1 - whether the range boundary is not a child of common ancestor.
			//
			// There's also an edge case in which both range boundaries were placed in empty nodes like:
			// <p>[</p><p>]</p>
			// Those boundaries were not removed, but in this case start and end nodes are child of the common ancestor.
			// We handle this edge case separately.
			if ( commonLevel < ( maxLevelLeft - 1 ) || commonLevel < ( maxLevelRight - 1 ) || boundariesInEmptyNode ) {
				if ( boundariesInEmptyNode ) {
					range.moveToPosition( endNode, CKEDITOR.POSITION_BEFORE_START );
				} else if ( ( maxLevelRight == commonLevel + 1 ) && cloneEndNode ) {
					// The maxLevelRight + 1 element could be already removed so we use the fact that
					// we know that it was the last element in its parent.
					range.moveToPosition( endParents[ commonLevel ], CKEDITOR.POSITION_BEFORE_END );
				} else {
					range.moveToPosition( endParents[ commonLevel + 1 ], CKEDITOR.POSITION_BEFORE_START );
				}

				// Merge split parents.
				if ( mergeThen ) {
					// Find the first diverged node in the left branch.
					var topLeft = startParents[ commonLevel + 1 ];

					// TopLeft may simply not exist if commonLevel == maxLevel or may be a text node.
					if ( topLeft && topLeft.type == CKEDITOR.NODE_ELEMENT ) {
						var span = CKEDITOR.dom.element.createFromHtml( '<span ' +
							'data-cke-bookmark="1" style="display:none">&nbsp;</span>', range.document );
						span.insertAfter( topLeft );
						topLeft.mergeSiblings( false );
						range.moveToBookmark( { startNode: span } );
					}
				}
			} else {
				// Collapse it to the start.
				range.collapse( true );
			}
		}
	}

	var inlineChildReqElements = {
		abbr: 1, acronym: 1, b: 1, bdo: 1, big: 1, cite: 1, code: 1, del: 1,
		dfn: 1, em: 1, font: 1, i: 1, ins: 1, label: 1, kbd: 1, q: 1, samp: 1, small: 1, span: 1, strike: 1,
		strong: 1, sub: 1, sup: 1, tt: 1, u: 1, 'var': 1
	};

	// Creates the appropriate node evaluator for the dom walker used inside
	// check(Start|End)OfBlock.
	function getCheckStartEndBlockEvalFunction() {
		var skipBogus = false,
			whitespaces = CKEDITOR.dom.walker.whitespaces(),
			bookmarkEvaluator = CKEDITOR.dom.walker.bookmark( true ),
			isBogus = CKEDITOR.dom.walker.bogus();

		return function( node ) {
			// First skip empty nodes
			if ( bookmarkEvaluator( node ) || whitespaces( node ) )
				return true;

			// Skip the bogus node at the end of block.
			if ( isBogus( node ) && !skipBogus ) {
				skipBogus = true;
				return true;
			}

			// If there's any visible text, then we're not at the start.
			if ( node.type == CKEDITOR.NODE_TEXT &&
				( node.hasAscendant( 'pre' ) ||
					CKEDITOR.tools.trim( node.getText() ).length ) ) {
				return false;
			}

			// If there are non-empty inline elements (e.g. <img />), then we're not
			// at the start.
			if ( node.type == CKEDITOR.NODE_ELEMENT && !node.is( inlineChildReqElements ) )
				return false;

			return true;
		};
	}

	var isBogus = CKEDITOR.dom.walker.bogus(),
		nbspRegExp = /^[\t\r\n ]*(?:&nbsp;|\xa0)$/,
		editableEval = CKEDITOR.dom.walker.editable(),
		notIgnoredEval = CKEDITOR.dom.walker.ignored( true );

	// Evaluator for CKEDITOR.dom.element::checkBoundaryOfElement, reject any
	// text node and non-empty elements unless it's being bookmark text.
	function elementBoundaryEval( checkStart ) {
		var whitespaces = CKEDITOR.dom.walker.whitespaces(),
			bookmark = CKEDITOR.dom.walker.bookmark( 1 );

		return function( node ) {
			// First skip empty nodes.
			if ( bookmark( node ) || whitespaces( node ) )
				return true;

			// Tolerant bogus br when checking at the end of block.
			// Reject any text node unless it's being bookmark
			// OR it's spaces.
			// Reject any element unless it's being invisible empty. (#3883)
			return !checkStart && isBogus( node ) ||
				node.type == CKEDITOR.NODE_ELEMENT &&
				node.is( CKEDITOR.dtd.$removeEmpty );
		};
	}

	function getNextEditableNode( isPrevious ) {
		return function() {
			var first;

			return this[ isPrevious ? 'getPreviousNode' : 'getNextNode' ]( function( node ) {
				// Cache first not ignorable node.
				if ( !first && notIgnoredEval( node ) )
					first = node;

				// Return true if found editable node, but not a bogus next to start of our lookup (first != bogus).
				return editableEval( node ) && !( isBogus( node ) && node.equals( first ) );
			} );
		};
	}

	CKEDITOR.dom.range.prototype = {
		
		clone: function() {
			var clone = new CKEDITOR.dom.range( this.root );

			clone._setStartContainer( this.startContainer );
			clone.startOffset = this.startOffset;
			clone._setEndContainer( this.endContainer );
			clone.endOffset = this.endOffset;
			clone.collapsed = this.collapsed;

			return clone;
		},

		
		collapse: function( toStart ) {
			if ( toStart ) {
				this._setEndContainer( this.startContainer );
				this.endOffset = this.startOffset;
			} else {
				this._setStartContainer( this.endContainer );
				this.startOffset = this.endOffset;
			}

			this.collapsed = true;
		},

		
		cloneContents: function( cloneId ) {
			var docFrag = new CKEDITOR.dom.documentFragment( this.document );

			cloneId = typeof cloneId == 'undefined' ? true : cloneId;

			if ( !this.collapsed )
				execContentsAction( this, 2, docFrag, false, cloneId );

			return docFrag;
		},

		
		deleteContents: function( mergeThen ) {
			if ( this.collapsed )
				return;

			execContentsAction( this, 0, null, mergeThen );
		},

		
		extractContents: function( mergeThen, cloneId ) {
			var docFrag = new CKEDITOR.dom.documentFragment( this.document );

			cloneId = typeof cloneId == 'undefined' ? true : cloneId;

			if ( !this.collapsed )
				execContentsAction( this, 1, docFrag, mergeThen, cloneId );

			return docFrag;
		},

		
		createBookmark: function( serializable ) {
			var startNode, endNode;
			var baseId;
			var clone;
			var collapsed = this.collapsed;

			startNode = this.document.createElement( 'span' );
			startNode.data( 'cke-bookmark', 1 );
			startNode.setStyle( 'display', 'none' );

			// For IE, it must have something inside, otherwise it may be
			// removed during DOM operations.
			startNode.setHtml( '&nbsp;' );

			if ( serializable ) {
				baseId = 'cke_bm_' + CKEDITOR.tools.getNextNumber();
				startNode.setAttribute( 'id', baseId + ( collapsed ? 'C' : 'S' ) );
			}

			// If collapsed, the endNode will not be created.
			if ( !collapsed ) {
				endNode = startNode.clone();
				endNode.setHtml( '&nbsp;' );

				if ( serializable )
					endNode.setAttribute( 'id', baseId + 'E' );

				clone = this.clone();
				clone.collapse();
				clone.insertNode( endNode );
			}

			clone = this.clone();
			clone.collapse( true );
			clone.insertNode( startNode );

			// Update the range position.
			if ( endNode ) {
				this.setStartAfter( startNode );
				this.setEndBefore( endNode );
			} else {
				this.moveToPosition( startNode, CKEDITOR.POSITION_AFTER_END );
			}

			return {
				startNode: serializable ? baseId + ( collapsed ? 'C' : 'S' ) : startNode,
				endNode: serializable ? baseId + 'E' : endNode,
				serializable: serializable,
				collapsed: collapsed
			};
		},

		
		createBookmark2: ( function() {
			var isNotText = CKEDITOR.dom.walker.nodeType( CKEDITOR.NODE_TEXT, true );

			// Returns true for limit anchored in element and placed between text nodes.
			//
			//               v
			// <p>[text node] [text node]</p> -> true
			//
			//    v
			// <p> [text node]</p> -> false
			//
			//              v
			// <p>[text node][text node]</p> -> false (limit is anchored in text node)
			function betweenTextNodes( container, offset ) {
				// Not anchored in element or limit is on the edge.
				if ( container.type != CKEDITOR.NODE_ELEMENT || offset === 0 || offset == container.getChildCount() )
					return 0;

				return container.getChild( offset - 1 ).type == CKEDITOR.NODE_TEXT &&
					container.getChild( offset ).type == CKEDITOR.NODE_TEXT;
			}

			// Sums lengths of all preceding text nodes.
			function getLengthOfPrecedingTextNodes( node ) {
				var sum = 0;

				while ( ( node = node.getPrevious() ) && node.type == CKEDITOR.NODE_TEXT )
					sum += node.getText().replace( CKEDITOR.dom.selection.FILLING_CHAR_SEQUENCE, '' ).length;

				return sum;
			}

			function normalizeTextNodes( limit ) {
				var container = limit.container,
					offset = limit.offset;

				// If limit is between text nodes move it to the end of preceding one,
				// because they will be merged.
				if ( betweenTextNodes( container, offset ) ) {
					container = container.getChild( offset - 1 );
					offset = container.getLength();
				}

				// Now, if limit is anchored in element and has at least one node before it,
				// it may happen that some of them will be merged. Normalize the offset
				// by setting it to normalized index of its preceding, safe node.
				// (safe == one for which getIndex(true) does not return -1, so one which won't disappear).
				if ( container.type == CKEDITOR.NODE_ELEMENT && offset > 0 ) {
					offset = getPrecedingSafeNodeIndex( container, offset ) + 1;
				}

				// The last step - fix the offset inside text node by adding
				// lengths of preceding text nodes which will be merged with container.
				if ( container.type == CKEDITOR.NODE_TEXT ) {
					var precedingLength = getLengthOfPrecedingTextNodes( container );

					// Normal case - text node is not empty.
					if ( container.getText() ) {
						offset += precedingLength;

					// Awful case - the text node is empty and thus will be totally lost.
					// In this case we are trying to normalize the limit to the left:
					// * either to the preceding text node,
					// * or to the "gap" after the preceding element.
					} else {
						// Find the closest non-text sibling.
						var precedingContainer = container.getPrevious( isNotText );

						// If there are any characters on the left, that means that we can anchor
						// there, because this text node will not be lost.
						if ( precedingLength ) {
							offset = precedingLength;

							if ( precedingContainer ) {
								// The text node is the first node after the closest non-text sibling.
								container = precedingContainer.getNext();
							} else {
								// But if there was no non-text sibling, then the text node is the first child.
								container = container.getParent().getFirst();
							}

						// If there are no characters on the left, then anchor after the previous non-text node.
						// E.g. (see tests for a legend :D):
						// <b>x</b>(foo)({}bar) -> <b>x</b>[](foo)(bar)
						} else {
							container = container.getParent();
							offset = precedingContainer ? ( precedingContainer.getIndex( true ) + 1 ) : 0;
						}
					}
				}

				limit.container = container;
				limit.offset = offset;
			}

			function normalizeFCSeq( limit, root ) {
				var fcseq = root.getCustomData( 'cke-fillingChar' );

				if ( !fcseq ) {
					return;
				}

				var container = limit.container;

				if ( fcseq.equals( container ) ) {
					limit.offset -= CKEDITOR.dom.selection.FILLING_CHAR_SEQUENCE.length;

					// == 0		handles case when limit was at the end of FCS.
					//  < 0		handles all cases where limit was somewhere in the middle or at the beginning.
					//  > 0		(the "else" case) means cases where there are some more characters in the FCS node (FCSabc^def).
					if ( limit.offset <= 0 ) {
						limit.offset = container.getIndex();
						limit.container = container.getParent();
					}
					return;
				}

				// And here goes the funny part - all other cases are handled inside node.getAddress() and getIndex() thanks to
				// node.getIndex() being aware of FCS (handling it as an empty node).
			}

			// Finds a normalized index of a safe node preceding this one.
			// Safe == one that will not disappear, so one for which getIndex( true ) does not return -1.
			// Return -1 if there's no safe preceding node.
			function getPrecedingSafeNodeIndex( container, offset ) {
				var index;

				while ( offset-- ) {
					index = container.getChild( offset ).getIndex( true );

					if ( index >= 0 )
						return index;
				}

				return -1;
			}

			return function( normalized ) {
				var collapsed = this.collapsed,
					bmStart = {
						container: this.startContainer,
						offset: this.startOffset
					},
					bmEnd = {
						container: this.endContainer,
						offset: this.endOffset
					};

				if ( normalized ) {
					normalizeTextNodes( bmStart );
					normalizeFCSeq( bmStart, this.root );

					if ( !collapsed ) {
						normalizeTextNodes( bmEnd );
						normalizeFCSeq( bmEnd, this.root );
					}
				}

				return {
					start: bmStart.container.getAddress( normalized ),
					end: collapsed ? null : bmEnd.container.getAddress( normalized ),
					startOffset: bmStart.offset,
					endOffset: bmEnd.offset,
					normalized: normalized,
					collapsed: collapsed,
					is2: true // It's a createBookmark2 bookmark.
				};
			};
		} )(),

		
		moveToBookmark: function( bookmark ) {
			// Created with createBookmark2().
			if ( bookmark.is2 ) {
				// Get the start information.
				var startContainer = this.document.getByAddress( bookmark.start, bookmark.normalized ),
					startOffset = bookmark.startOffset;

				// Get the end information.
				var endContainer = bookmark.end && this.document.getByAddress( bookmark.end, bookmark.normalized ),
					endOffset = bookmark.endOffset;

				// Set the start boundary.
				this.setStart( startContainer, startOffset );

				// Set the end boundary. If not available, collapse it.
				if ( endContainer )
					this.setEnd( endContainer, endOffset );
				else
					this.collapse( true );
			}
			// Created with createBookmark().
			else {
				var serializable = bookmark.serializable,
					startNode = serializable ? this.document.getById( bookmark.startNode ) : bookmark.startNode,
					endNode = serializable ? this.document.getById( bookmark.endNode ) : bookmark.endNode;

				// Set the range start at the bookmark start node position.
				this.setStartBefore( startNode );

				// Remove it, because it may interfere in the setEndBefore call.
				startNode.remove();

				// Set the range end at the bookmark end node position, or simply
				// collapse it if it is not available.
				if ( endNode ) {
					this.setEndBefore( endNode );
					endNode.remove();
				} else {
					this.collapse( true );
				}
			}
		},

		
		getBoundaryNodes: function() {
			var startNode = this.startContainer,
				endNode = this.endContainer,
				startOffset = this.startOffset,
				endOffset = this.endOffset,
				childCount;

			if ( startNode.type == CKEDITOR.NODE_ELEMENT ) {
				childCount = startNode.getChildCount();
				if ( childCount > startOffset ) {
					startNode = startNode.getChild( startOffset );
				} else if ( childCount < 1 ) {
					startNode = startNode.getPreviousSourceNode();
				}
				// startOffset > childCount but childCount is not 0
				else {
					// Try to take the node just after the current position.
					startNode = startNode.$;
					while ( startNode.lastChild )
						startNode = startNode.lastChild;
					startNode = new CKEDITOR.dom.node( startNode );

					// Normally we should take the next node in DFS order. But it
					// is also possible that we've already reached the end of
					// document.
					startNode = startNode.getNextSourceNode() || startNode;
				}
			}

			if ( endNode.type == CKEDITOR.NODE_ELEMENT ) {
				childCount = endNode.getChildCount();
				if ( childCount > endOffset ) {
					endNode = endNode.getChild( endOffset ).getPreviousSourceNode( true );
				} else if ( childCount < 1 ) {
					endNode = endNode.getPreviousSourceNode();
				}
				// endOffset > childCount but childCount is not 0.
				else {
					// Try to take the node just before the current position.
					endNode = endNode.$;
					while ( endNode.lastChild )
						endNode = endNode.lastChild;
					endNode = new CKEDITOR.dom.node( endNode );
				}
			}

			// Sometimes the endNode will come right before startNode for collapsed
			// ranges. Fix it. (#3780)
			if ( startNode.getPosition( endNode ) & CKEDITOR.POSITION_FOLLOWING )
				startNode = endNode;

			return { startNode: startNode, endNode: endNode };
		},

		
		getCommonAncestor: function( includeSelf, ignoreTextNode ) {
			var start = this.startContainer,
				end = this.endContainer,
				ancestor;

			if ( start.equals( end ) ) {
				if ( includeSelf && start.type == CKEDITOR.NODE_ELEMENT && this.startOffset == this.endOffset - 1 )
					ancestor = start.getChild( this.startOffset );
				else
					ancestor = start;
			} else {
				ancestor = start.getCommonAncestor( end );
			}

			return ignoreTextNode && !ancestor.is ? ancestor.getParent() : ancestor;
		},

		
		optimize: function() {
			var container = this.startContainer;
			var offset = this.startOffset;

			if ( container.type != CKEDITOR.NODE_ELEMENT ) {
				if ( !offset )
					this.setStartBefore( container );
				else if ( offset >= container.getLength() )
					this.setStartAfter( container );
			}

			container = this.endContainer;
			offset = this.endOffset;

			if ( container.type != CKEDITOR.NODE_ELEMENT ) {
				if ( !offset )
					this.setEndBefore( container );
				else if ( offset >= container.getLength() )
					this.setEndAfter( container );
			}
		},

		
		optimizeBookmark: function() {
			var startNode = this.startContainer,
				endNode = this.endContainer;

			if ( startNode.is && startNode.is( 'span' ) && startNode.data( 'cke-bookmark' ) )
				this.setStartAt( startNode, CKEDITOR.POSITION_BEFORE_START );
			if ( endNode && endNode.is && endNode.is( 'span' ) && endNode.data( 'cke-bookmark' ) )
				this.setEndAt( endNode, CKEDITOR.POSITION_AFTER_END );
		},

		
		trim: function( ignoreStart, ignoreEnd ) {
			var startContainer = this.startContainer,
				startOffset = this.startOffset,
				collapsed = this.collapsed;
			if ( ( !ignoreStart || collapsed ) && startContainer && startContainer.type == CKEDITOR.NODE_TEXT ) {
				// If the offset is zero, we just insert the new node before
				// the start.
				if ( !startOffset ) {
					startOffset = startContainer.getIndex();
					startContainer = startContainer.getParent();
				}
				// If the offset is at the end, we'll insert it after the text
				// node.
				else if ( startOffset >= startContainer.getLength() ) {
					startOffset = startContainer.getIndex() + 1;
					startContainer = startContainer.getParent();
				}
				// In other case, we split the text node and insert the new
				// node at the split point.
				else {
					var nextText = startContainer.split( startOffset );

					startOffset = startContainer.getIndex() + 1;
					startContainer = startContainer.getParent();

					// Check all necessity of updating the end boundary.
					if ( this.startContainer.equals( this.endContainer ) )
						this.setEnd( nextText, this.endOffset - this.startOffset );
					else if ( startContainer.equals( this.endContainer ) )
						this.endOffset += 1;
				}

				this.setStart( startContainer, startOffset );

				if ( collapsed ) {
					this.collapse( true );
					return;
				}
			}

			var endContainer = this.endContainer;
			var endOffset = this.endOffset;

			if ( !( ignoreEnd || collapsed ) && endContainer && endContainer.type == CKEDITOR.NODE_TEXT ) {
				// If the offset is zero, we just insert the new node before
				// the start.
				if ( !endOffset ) {
					endOffset = endContainer.getIndex();
					endContainer = endContainer.getParent();
				}
				// If the offset is at the end, we'll insert it after the text
				// node.
				else if ( endOffset >= endContainer.getLength() ) {
					endOffset = endContainer.getIndex() + 1;
					endContainer = endContainer.getParent();
				}
				// In other case, we split the text node and insert the new
				// node at the split point.
				else {
					endContainer.split( endOffset );

					endOffset = endContainer.getIndex() + 1;
					endContainer = endContainer.getParent();
				}

				this.setEnd( endContainer, endOffset );
			}
		},

		
		enlarge: function( unit, excludeBrs ) {
			var leadingWhitespaceRegex = new RegExp( /[^\s\ufeff]/ );

			switch ( unit ) {
				case CKEDITOR.ENLARGE_INLINE:
					var enlargeInlineOnly = 1;

				
				case CKEDITOR.ENLARGE_ELEMENT:

					if ( this.collapsed )
						return;

					// Get the common ancestor.
					var commonAncestor = this.getCommonAncestor();

					var boundary = this.root;

					// For each boundary
					//		a. Depending on its position, find out the first node to be checked (a sibling) or,
					//			if not available, to be enlarge.
					//		b. Go ahead checking siblings and enlarging the boundary as much as possible until the
					//			common ancestor is not reached. After reaching the common ancestor, just save the
					//			enlargeable node to be used later.

					var startTop, endTop;

					var enlargeable, sibling, commonReached;

					// Indicates that the node can be added only if whitespace
					// is available before it.
					var needsWhiteSpace = false;
					var isWhiteSpace;
					var siblingText;

					// Process the start boundary.

					var container = this.startContainer;
					var offset = this.startOffset;

					if ( container.type == CKEDITOR.NODE_TEXT ) {
						if ( offset ) {
							// Check if there is any non-space text before the
							// offset. Otherwise, container is null.
							container = !CKEDITOR.tools.trim( container.substring( 0, offset ) ).length && container;

							// If we found only whitespace in the node, it
							// means that we'll need more whitespace to be able
							// to expand. For example, <i> can be expanded in
							// "A <i> [B]</i>", but not in "A<i> [B]</i>".
							needsWhiteSpace = !!container;
						}

						if ( container ) {
							if ( !( sibling = container.getPrevious() ) )
								enlargeable = container.getParent();
						}
					} else {
						// If we have offset, get the node preceeding it as the
						// first sibling to be checked.
						if ( offset )
							sibling = container.getChild( offset - 1 ) || container.getLast();

						// If there is no sibling, mark the container to be
						// enlarged.
						if ( !sibling )
							enlargeable = container;
					}

					// Ensures that enlargeable can be indeed enlarged, if not it will be nulled.
					enlargeable = getValidEnlargeable( enlargeable );

					while ( enlargeable || sibling ) {
						if ( enlargeable && !sibling ) {
							// If we reached the common ancestor, mark the flag
							// for it.
							if ( !commonReached && enlargeable.equals( commonAncestor ) )
								commonReached = true;

							if ( enlargeInlineOnly ? enlargeable.isBlockBoundary() : !boundary.contains( enlargeable ) )
								break;

							// If we don't need space or this element breaks
							// the line, then enlarge it.
							if ( !needsWhiteSpace || enlargeable.getComputedStyle( 'display' ) != 'inline' ) {
								needsWhiteSpace = false;

								// If the common ancestor has been reached,
								// we'll not enlarge it immediately, but just
								// mark it to be enlarged later if the end
								// boundary also enlarges it.
								if ( commonReached )
									startTop = enlargeable;
								else
									this.setStartBefore( enlargeable );
							}

							sibling = enlargeable.getPrevious();
						}

						// Check all sibling nodes preceeding the enlargeable
						// node. The node wil lbe enlarged only if none of them
						// blocks it.
						while ( sibling ) {
							// This flag indicates that this node has
							// whitespaces at the end.
							isWhiteSpace = false;

							if ( sibling.type == CKEDITOR.NODE_COMMENT ) {
								sibling = sibling.getPrevious();
								continue;
							} else if ( sibling.type == CKEDITOR.NODE_TEXT ) {
								siblingText = sibling.getText();

								if ( leadingWhitespaceRegex.test( siblingText ) )
									sibling = null;

								isWhiteSpace = /[\s\ufeff]$/.test( siblingText );
							} else {
								// #12221 (Chrome) plus #11111 (Safari).
								var offsetWidth0 = CKEDITOR.env.webkit ? 1 : 0;

								// If this is a visible element.
								// We need to check for the bookmark attribute because IE insists on
								// rendering the display:none nodes we use for bookmarks. (#3363)
								// Line-breaks (br) are rendered with zero width, which we don't want to include. (#7041)
								if ( ( sibling.$.offsetWidth > offsetWidth0 || excludeBrs && sibling.is( 'br' ) ) && !sibling.data( 'cke-bookmark' ) ) {
									// We'll accept it only if we need
									// whitespace, and this is an inline
									// element with whitespace only.
									if ( needsWhiteSpace && CKEDITOR.dtd.$removeEmpty[ sibling.getName() ] ) {
										// It must contains spaces and inline elements only.

										siblingText = sibling.getText();

										if ( leadingWhitespaceRegex.test( siblingText ) ) // Spaces + Zero Width No-Break Space (U+FEFF)
										sibling = null;
										else {
											var allChildren = sibling.$.getElementsByTagName( '*' );
											for ( var i = 0, child; child = allChildren[ i++ ]; ) {
												if ( !CKEDITOR.dtd.$removeEmpty[ child.nodeName.toLowerCase() ] ) {
													sibling = null;
													break;
												}
											}
										}

										if ( sibling )
											isWhiteSpace = !!siblingText.length;
									} else {
										sibling = null;
									}
								}
							}

							// A node with whitespaces has been found.
							if ( isWhiteSpace ) {
								// Enlarge the last enlargeable node, if we
								// were waiting for spaces.
								if ( needsWhiteSpace ) {
									if ( commonReached )
										startTop = enlargeable;
									else if ( enlargeable )
										this.setStartBefore( enlargeable );
								} else {
									needsWhiteSpace = true;
								}
							}

							if ( sibling ) {
								var next = sibling.getPrevious();

								if ( !enlargeable && !next ) {
									// Set the sibling as enlargeable, so it's
									// parent will be get later outside this while.
									enlargeable = sibling;
									sibling = null;
									break;
								}

								sibling = next;
							} else {
								// If sibling has been set to null, then we
								// need to stop enlarging.
								enlargeable = null;
							}
						}

						if ( enlargeable )
							enlargeable = getValidEnlargeable( enlargeable.getParent() );
					}

					// Process the end boundary. This is basically the same
					// code used for the start boundary, with small changes to
					// make it work in the oposite side (to the right). This
					// makes it difficult to reuse the code here. So, fixes to
					// the above code are likely to be replicated here.

					container = this.endContainer;
					offset = this.endOffset;

					// Reset the common variables.
					enlargeable = sibling = null;
					commonReached = needsWhiteSpace = false;

					// Function check if there are only whitespaces from the given starting point
					// (startContainer and startOffset) till the end on block.
					// Examples ("[" is the start point):
					//  - <p>foo[ </p>           - will return true,
					//  - <p><b>foo[ </b> </p>   - will return true,
					//  - <p>foo[ bar</p>        - will return false,
					//  - <p><b>foo[ </b>bar</p> - will return false,
					//  - <p>foo[ <b></b></p>    - will return false.
					function onlyWhiteSpaces( startContainer, startOffset ) {
						// We need to enlarge range if there is white space at the end of the block,
						// because it is not displayed in WYSIWYG mode and user can not select it. So
						// "<p>foo[bar] </p>" should be changed to "<p>foo[bar ]</p>". On the other hand
						// we should do nothing if we are not at the end of the block, so this should not
						// be changed: "<p><i>[foo] </i>bar</p>".
						var walkerRange = new CKEDITOR.dom.range( boundary );
						walkerRange.setStart( startContainer, startOffset );
						// The guard will find the end of range so I put boundary here.
						walkerRange.setEndAt( boundary, CKEDITOR.POSITION_BEFORE_END );

						var walker = new CKEDITOR.dom.walker( walkerRange ),
							node;

						walker.guard = function( node ) {
							// Stop if you exit block.
							return !( node.type == CKEDITOR.NODE_ELEMENT && node.isBlockBoundary() );
						};

						while ( ( node = walker.next() ) ) {
							if ( node.type != CKEDITOR.NODE_TEXT ) {
								// Stop if you enter to any node (walker.next() will return node only
								// it goes out, not if it is go into node).
								return false;
							} else {
								// Trim the first node to startOffset.
								if ( node != startContainer )
									siblingText = node.getText();
								else
									siblingText = node.substring( startOffset );

								// Check if it is white space.
								if ( leadingWhitespaceRegex.test( siblingText ) )
									return false;
							}
						}

						return true;
					}

					if ( container.type == CKEDITOR.NODE_TEXT ) {
						// Check if there is only white space after the offset.
						if ( CKEDITOR.tools.trim( container.substring( offset ) ).length ) {
							// If we found only whitespace in the node, it
							// means that we'll need more whitespace to be able
							// to expand. For example, <i> can be expanded in
							// "A <i> [B]</i>", but not in "A<i> [B]</i>".
							needsWhiteSpace = true;
						} else {
							needsWhiteSpace = !container.getLength();

							if ( offset == container.getLength() ) {
								// If we are at the end of container and this is the last text node,
								// we should enlarge end to the parent.
								if ( !( sibling = container.getNext() ) )
									enlargeable = container.getParent();
							} else {
								// If we are in the middle on text node and there are only whitespaces
								// till the end of block, we should enlarge element.
								if ( onlyWhiteSpaces( container, offset ) )
									enlargeable = container.getParent();
							}
						}
					} else {
						// Get the node right after the boudary to be checked
						// first.
						sibling = container.getChild( offset );

						if ( !sibling )
							enlargeable = container;
					}

					while ( enlargeable || sibling ) {
						if ( enlargeable && !sibling ) {
							if ( !commonReached && enlargeable.equals( commonAncestor ) )
								commonReached = true;

							if ( enlargeInlineOnly ? enlargeable.isBlockBoundary() : !boundary.contains( enlargeable ) )
								break;

							if ( !needsWhiteSpace || enlargeable.getComputedStyle( 'display' ) != 'inline' ) {
								needsWhiteSpace = false;

								if ( commonReached )
									endTop = enlargeable;
								else if ( enlargeable )
									this.setEndAfter( enlargeable );
							}

							sibling = enlargeable.getNext();
						}

						while ( sibling ) {
							isWhiteSpace = false;

							if ( sibling.type == CKEDITOR.NODE_TEXT ) {
								siblingText = sibling.getText();

								// Check if there are not whitespace characters till the end of editable.
								// If so stop expanding.
								if ( !onlyWhiteSpaces( sibling, 0 ) )
									sibling = null;

								isWhiteSpace = /^[\s\ufeff]/.test( siblingText );
							} else if ( sibling.type == CKEDITOR.NODE_ELEMENT ) {
								// If this is a visible element.
								// We need to check for the bookmark attribute because IE insists on
								// rendering the display:none nodes we use for bookmarks. (#3363)
								// Line-breaks (br) are rendered with zero width, which we don't want to include. (#7041)
								if ( ( sibling.$.offsetWidth > 0 || excludeBrs && sibling.is( 'br' ) ) && !sibling.data( 'cke-bookmark' ) ) {
									// We'll accept it only if we need
									// whitespace, and this is an inline
									// element with whitespace only.
									if ( needsWhiteSpace && CKEDITOR.dtd.$removeEmpty[ sibling.getName() ] ) {
										// It must contains spaces and inline elements only.

										siblingText = sibling.getText();

										if ( leadingWhitespaceRegex.test( siblingText ) )
											sibling = null;
										else {
											allChildren = sibling.$.getElementsByTagName( '*' );
											for ( i = 0; child = allChildren[ i++ ]; ) {
												if ( !CKEDITOR.dtd.$removeEmpty[ child.nodeName.toLowerCase() ] ) {
													sibling = null;
													break;
												}
											}
										}

										if ( sibling )
											isWhiteSpace = !!siblingText.length;
									} else {
										sibling = null;
									}
								}
							} else {
								isWhiteSpace = 1;
							}

							if ( isWhiteSpace ) {
								if ( needsWhiteSpace ) {
									if ( commonReached )
										endTop = enlargeable;
									else
										this.setEndAfter( enlargeable );
								}
							}

							if ( sibling ) {
								next = sibling.getNext();

								if ( !enlargeable && !next ) {
									enlargeable = sibling;
									sibling = null;
									break;
								}

								sibling = next;
							} else {
								// If sibling has been set to null, then we
								// need to stop enlarging.
								enlargeable = null;
							}
						}

						if ( enlargeable )
							enlargeable = getValidEnlargeable( enlargeable.getParent() );
					}

					// If the common ancestor can be enlarged by both boundaries, then include it also.
					if ( startTop && endTop ) {
						commonAncestor = startTop.contains( endTop ) ? endTop : startTop;

						this.setStartBefore( commonAncestor );
						this.setEndAfter( commonAncestor );
					}
					break;

				case CKEDITOR.ENLARGE_BLOCK_CONTENTS:
				case CKEDITOR.ENLARGE_LIST_ITEM_CONTENTS:

					// Enlarging the start boundary.
					var walkerRange = new CKEDITOR.dom.range( this.root );

					boundary = this.root;

					walkerRange.setStartAt( boundary, CKEDITOR.POSITION_AFTER_START );
					walkerRange.setEnd( this.startContainer, this.startOffset );

					var walker = new CKEDITOR.dom.walker( walkerRange ),
						blockBoundary, // The node on which the enlarging should stop.
						tailBr, // In case BR as block boundary.
						notBlockBoundary = CKEDITOR.dom.walker.blockBoundary( ( unit == CKEDITOR.ENLARGE_LIST_ITEM_CONTENTS ) ? { br: 1 } : null ),
						inNonEditable = null,
						// Record the encountered 'blockBoundary' for later use.
						boundaryGuard = function( node ) {
							// We should not check contents of non-editable elements. It may happen
							// that inline widget has display:table child which should not block range#enlarge.
							// When encoutered non-editable element...
							if ( node.type == CKEDITOR.NODE_ELEMENT && node.getAttribute( 'contenteditable' ) == 'false' ) {
								if ( inNonEditable ) {
									// ... in which we already were, reset it (because we're leaving it) and return.
									if ( inNonEditable.equals( node ) ) {
										inNonEditable = null;
										return;
									}
								// ... which we're entering, remember it but check it (no return).
								} else {
									inNonEditable = node;
								}
							// When we are in non-editable element, do not check if current node is a block boundary.
							} else if ( inNonEditable ) {
								return;
							}

							var retval = notBlockBoundary( node );
							if ( !retval )
								blockBoundary = node;
							return retval;
						},
						// Record the encounted 'tailBr' for later use.
						tailBrGuard = function( node ) {
							var retval = boundaryGuard( node );
							if ( !retval && node.is && node.is( 'br' ) )
								tailBr = node;
							return retval;
						};

					walker.guard = boundaryGuard;

					enlargeable = walker.lastBackward();

					// It's the body which stop the enlarging if no block boundary found.
					blockBoundary = blockBoundary || boundary;

					// Start the range either after the end of found block (<p>...</p>[text)
					// or at the start of block (<p>[text...), by comparing the document position
					// with 'enlargeable' node.
					this.setStartAt( blockBoundary, !blockBoundary.is( 'br' ) && ( !enlargeable && this.checkStartOfBlock() ||
						enlargeable && blockBoundary.contains( enlargeable ) ) ? CKEDITOR.POSITION_AFTER_START : CKEDITOR.POSITION_AFTER_END );

					// Avoid enlarging the range further when end boundary spans right after the BR. (#7490)
					if ( unit == CKEDITOR.ENLARGE_LIST_ITEM_CONTENTS ) {
						var theRange = this.clone();
						walker = new CKEDITOR.dom.walker( theRange );

						var whitespaces = CKEDITOR.dom.walker.whitespaces(),
							bookmark = CKEDITOR.dom.walker.bookmark();

						walker.evaluator = function( node ) {
							return !whitespaces( node ) && !bookmark( node );
						};
						var previous = walker.previous();
						if ( previous && previous.type == CKEDITOR.NODE_ELEMENT && previous.is( 'br' ) )
							return;
					}

					// Enlarging the end boundary.
					// Set up new range and reset all flags (blockBoundary, inNonEditable, tailBr).

					walkerRange = this.clone();
					walkerRange.collapse();
					walkerRange.setEndAt( boundary, CKEDITOR.POSITION_BEFORE_END );
					walker = new CKEDITOR.dom.walker( walkerRange );

					// tailBrGuard only used for on range end.
					walker.guard = ( unit == CKEDITOR.ENLARGE_LIST_ITEM_CONTENTS ) ? tailBrGuard : boundaryGuard;
					blockBoundary = inNonEditable = tailBr = null;

					// End the range right before the block boundary node.
					enlargeable = walker.lastForward();

					// It's the body which stop the enlarging if no block boundary found.
					blockBoundary = blockBoundary || boundary;

					// Close the range either before the found block start (text]<p>...</p>) or at the block end (...text]</p>)
					// by comparing the document position with 'enlargeable' node.
					this.setEndAt( blockBoundary, ( !enlargeable && this.checkEndOfBlock() ||
						enlargeable && blockBoundary.contains( enlargeable ) ) ? CKEDITOR.POSITION_BEFORE_END : CKEDITOR.POSITION_BEFORE_START );
					// We must include the <br> at the end of range if there's
					// one and we're expanding list item contents
					if ( tailBr ) {
						this.setEndAfter( tailBr );
					}
			}

			// Ensures that returned element can be enlarged by selection, null otherwise.
			// @param {CKEDITOR.dom.element} enlargeable
			// @returns {CKEDITOR.dom.element/null}
			function getValidEnlargeable( enlargeable ) {
				return enlargeable && enlargeable.type == CKEDITOR.NODE_ELEMENT && enlargeable.hasAttribute( 'contenteditable' ) ?
					null : enlargeable;
			}
		},

		
		shrink: function( mode, selectContents, shrinkOnBlockBoundary ) {
			// Unable to shrink a collapsed range.
			if ( !this.collapsed ) {
				mode = mode || CKEDITOR.SHRINK_TEXT;

				var walkerRange = this.clone();

				var startContainer = this.startContainer,
					endContainer = this.endContainer,
					startOffset = this.startOffset,
					endOffset = this.endOffset;

				// Whether the start/end boundary is moveable.
				var moveStart = 1,
					moveEnd = 1;

				if ( startContainer && startContainer.type == CKEDITOR.NODE_TEXT ) {
					if ( !startOffset )
						walkerRange.setStartBefore( startContainer );
					else if ( startOffset >= startContainer.getLength() )
						walkerRange.setStartAfter( startContainer );
					else {
						// Enlarge the range properly to avoid walker making
						// DOM changes caused by triming the text nodes later.
						walkerRange.setStartBefore( startContainer );
						moveStart = 0;
					}
				}

				if ( endContainer && endContainer.type == CKEDITOR.NODE_TEXT ) {
					if ( !endOffset )
						walkerRange.setEndBefore( endContainer );
					else if ( endOffset >= endContainer.getLength() )
						walkerRange.setEndAfter( endContainer );
					else {
						walkerRange.setEndAfter( endContainer );
						moveEnd = 0;
					}
				}

				var walker = new CKEDITOR.dom.walker( walkerRange ),
					isBookmark = CKEDITOR.dom.walker.bookmark();

				walker.evaluator = function( node ) {
					return node.type == ( mode == CKEDITOR.SHRINK_ELEMENT ? CKEDITOR.NODE_ELEMENT : CKEDITOR.NODE_TEXT );
				};

				var currentElement;
				walker.guard = function( node, movingOut ) {
					if ( isBookmark( node ) )
						return true;

					// Stop when we're shrink in element mode while encountering a text node.
					if ( mode == CKEDITOR.SHRINK_ELEMENT && node.type == CKEDITOR.NODE_TEXT )
						return false;

					// Stop when we've already walked "through" an element.
					if ( movingOut && node.equals( currentElement ) )
						return false;

					if ( shrinkOnBlockBoundary === false && node.type == CKEDITOR.NODE_ELEMENT && node.isBlockBoundary() )
						return false;

					// Stop shrinking when encountering an editable border.
					if ( node.type == CKEDITOR.NODE_ELEMENT && node.hasAttribute( 'contenteditable' ) )
						return false;

					if ( !movingOut && node.type == CKEDITOR.NODE_ELEMENT )
						currentElement = node;

					return true;
				};

				if ( moveStart ) {
					var textStart = walker[ mode == CKEDITOR.SHRINK_ELEMENT ? 'lastForward' : 'next' ]();
					textStart && this.setStartAt( textStart, selectContents ? CKEDITOR.POSITION_AFTER_START : CKEDITOR.POSITION_BEFORE_START );
				}

				if ( moveEnd ) {
					walker.reset();
					var textEnd = walker[ mode == CKEDITOR.SHRINK_ELEMENT ? 'lastBackward' : 'previous' ]();
					textEnd && this.setEndAt( textEnd, selectContents ? CKEDITOR.POSITION_BEFORE_END : CKEDITOR.POSITION_AFTER_END );
				}

				return !!( moveStart || moveEnd );
			}
		},

		
		insertNode: function( node ) {
			this.optimizeBookmark();
			this.trim( false, true );

			var startContainer = this.startContainer;
			var startOffset = this.startOffset;

			var nextNode = startContainer.getChild( startOffset );

			if ( nextNode )
				node.insertBefore( nextNode );
			else
				startContainer.append( node );

			// Check if we need to update the end boundary.
			if ( node.getParent() && node.getParent().equals( this.endContainer ) )
				this.endOffset++;

			// Expand the range to embrace the new node.
			this.setStartBefore( node );
		},

		
		moveToPosition: function( node, position ) {
			this.setStartAt( node, position );
			this.collapse( true );
		},

		
		moveToRange: function( range ) {
			this.setStart( range.startContainer, range.startOffset );
			this.setEnd( range.endContainer, range.endOffset );
		},

		
		selectNodeContents: function( node ) {
			this.setStart( node, 0 );
			this.setEnd( node, node.type == CKEDITOR.NODE_TEXT ? node.getLength() : node.getChildCount() );
		},

		
		setStart: function( startNode, startOffset ) {
			// W3C requires a check for the new position. If it is after the end
			// boundary, the range should be collapsed to the new start. It seams
			// we will not need this check for our use of this class so we can
			// ignore it for now.

			// Fixing invalid range start inside dtd empty elements.
			if ( startNode.type == CKEDITOR.NODE_ELEMENT && CKEDITOR.dtd.$empty[ startNode.getName() ] )
				startOffset = startNode.getIndex(), startNode = startNode.getParent();

			this._setStartContainer( startNode );
			this.startOffset = startOffset;

			if ( !this.endContainer ) {
				this._setEndContainer( startNode );
				this.endOffset = startOffset;
			}

			updateCollapsed( this );
		},

		
		setEnd: function( endNode, endOffset ) {
			// W3C requires a check for the new position. If it is before the start
			// boundary, the range should be collapsed to the new end. It seams we
			// will not need this check for our use of this class so we can ignore
			// it for now.

			// Fixing invalid range end inside dtd empty elements.
			if ( endNode.type == CKEDITOR.NODE_ELEMENT && CKEDITOR.dtd.$empty[ endNode.getName() ] )
				endOffset = endNode.getIndex() + 1, endNode = endNode.getParent();

			this._setEndContainer( endNode );
			this.endOffset = endOffset;

			if ( !this.startContainer ) {
				this._setStartContainer( endNode );
				this.startOffset = endOffset;
			}

			updateCollapsed( this );
		},

		
		setStartAfter: function( node ) {
			this.setStart( node.getParent(), node.getIndex() + 1 );
		},

		
		setStartBefore: function( node ) {
			this.setStart( node.getParent(), node.getIndex() );
		},

		
		setEndAfter: function( node ) {
			this.setEnd( node.getParent(), node.getIndex() + 1 );
		},

		
		setEndBefore: function( node ) {
			this.setEnd( node.getParent(), node.getIndex() );
		},

		
		setStartAt: function( node, position ) {
			switch ( position ) {
				case CKEDITOR.POSITION_AFTER_START:
					this.setStart( node, 0 );
					break;

				case CKEDITOR.POSITION_BEFORE_END:
					if ( node.type == CKEDITOR.NODE_TEXT )
						this.setStart( node, node.getLength() );
					else
						this.setStart( node, node.getChildCount() );
					break;

				case CKEDITOR.POSITION_BEFORE_START:
					this.setStartBefore( node );
					break;

				case CKEDITOR.POSITION_AFTER_END:
					this.setStartAfter( node );
			}

			updateCollapsed( this );
		},

		
		setEndAt: function( node, position ) {
			switch ( position ) {
				case CKEDITOR.POSITION_AFTER_START:
					this.setEnd( node, 0 );
					break;

				case CKEDITOR.POSITION_BEFORE_END:
					if ( node.type == CKEDITOR.NODE_TEXT )
						this.setEnd( node, node.getLength() );
					else
						this.setEnd( node, node.getChildCount() );
					break;

				case CKEDITOR.POSITION_BEFORE_START:
					this.setEndBefore( node );
					break;

				case CKEDITOR.POSITION_AFTER_END:
					this.setEndAfter( node );
			}

			updateCollapsed( this );
		},

		
		fixBlock: function( isStart, blockTag ) {
			var bookmark = this.createBookmark(),
				fixedBlock = this.document.createElement( blockTag );

			this.collapse( isStart );

			this.enlarge( CKEDITOR.ENLARGE_BLOCK_CONTENTS );

			this.extractContents().appendTo( fixedBlock );
			fixedBlock.trim();

			this.insertNode( fixedBlock );

			// Bogus <br> could already exist in the range's container before fixBlock() was called. In such case it was
			// extracted and appended to the fixBlock. However, we are not sure that it's at the end of
			// the fixedBlock, because of FF's terrible bug. When creating a bookmark in an empty editable
			// FF moves the bogus <br> before that bookmark (<editable><br /><bm />[]</editable>).
			// So even if the initial range was placed before the bogus <br>, after creating the bookmark it
			// is placed before the bookmark.
			// Fortunately, getBogus() is able to skip the bookmark so it finds the bogus <br> in this case.
			// We remove incorrectly placed one and add a brand new one. (#13001)
			var bogus = fixedBlock.getBogus();
			if ( bogus ) {
				bogus.remove();
			}
			fixedBlock.appendBogus();

			this.moveToBookmark( bookmark );

			return fixedBlock;
		},

		
		splitBlock: function( blockTag, cloneId ) {
			var startPath = new CKEDITOR.dom.elementPath( this.startContainer, this.root ),
				endPath = new CKEDITOR.dom.elementPath( this.endContainer, this.root );

			var startBlockLimit = startPath.blockLimit,
				endBlockLimit = endPath.blockLimit;

			var startBlock = startPath.block,
				endBlock = endPath.block;

			var elementPath = null;
			// Do nothing if the boundaries are in different block limits.
			if ( !startBlockLimit.equals( endBlockLimit ) )
				return null;

			// Get or fix current blocks.
			if ( blockTag != 'br' ) {
				if ( !startBlock ) {
					startBlock = this.fixBlock( true, blockTag );
					endBlock = new CKEDITOR.dom.elementPath( this.endContainer, this.root ).block;
				}

				if ( !endBlock )
					endBlock = this.fixBlock( false, blockTag );
			}

			// Get the range position.
			var isStartOfBlock = startBlock && this.checkStartOfBlock(),
				isEndOfBlock = endBlock && this.checkEndOfBlock();

			// Delete the current contents.
			// TODO: Why is 2.x doing CheckIsEmpty()?
			this.deleteContents();

			if ( startBlock && startBlock.equals( endBlock ) ) {
				if ( isEndOfBlock ) {
					elementPath = new CKEDITOR.dom.elementPath( this.startContainer, this.root );
					this.moveToPosition( endBlock, CKEDITOR.POSITION_AFTER_END );
					endBlock = null;
				} else if ( isStartOfBlock ) {
					elementPath = new CKEDITOR.dom.elementPath( this.startContainer, this.root );
					this.moveToPosition( startBlock, CKEDITOR.POSITION_BEFORE_START );
					startBlock = null;
				} else {
					endBlock = this.splitElement( startBlock, cloneId || false );

					// In Gecko, the last child node must be a bogus <br>.
					// Note: bogus <br> added under <ul> or <ol> would cause
					// lists to be incorrectly rendered.
					if ( !startBlock.is( 'ul', 'ol' ) )
						startBlock.appendBogus();
				}
			}

			return {
				previousBlock: startBlock,
				nextBlock: endBlock,
				wasStartOfBlock: isStartOfBlock,
				wasEndOfBlock: isEndOfBlock,
				elementPath: elementPath
			};
		},

		
		splitElement: function( toSplit, cloneId ) {
			if ( !this.collapsed )
				return null;

			// Extract the contents of the block from the selection point to the end
			// of its contents.
			this.setEndAt( toSplit, CKEDITOR.POSITION_BEFORE_END );
			var documentFragment = this.extractContents( false, cloneId || false );

			// Duplicate the element after it.
			var clone = toSplit.clone( false, cloneId || false );

			// Place the extracted contents into the duplicated element.
			documentFragment.appendTo( clone );
			clone.insertAfter( toSplit );
			this.moveToPosition( toSplit, CKEDITOR.POSITION_AFTER_END );
			return clone;
		},

		
		removeEmptyBlocksAtEnd: ( function() {

			var whitespace = CKEDITOR.dom.walker.whitespaces(),
					bookmark = CKEDITOR.dom.walker.bookmark( false );

			function childEval( parent ) {
				return function( node ) {
					// Whitespace, bookmarks, empty inlines.
					if ( whitespace( node ) || bookmark( node ) ||
							node.type == CKEDITOR.NODE_ELEMENT &&
							node.isEmptyInlineRemoveable() ) {
						return false;
					} else if ( parent.is( 'table' ) && node.is( 'caption' ) ) {
						return false;
					}

					return true;
				};
			}

			return function( atEnd ) {

				var bm = this.createBookmark();
				var path = this[ atEnd ? 'endPath' : 'startPath' ]();
				var block = path.block || path.blockLimit, parent;

				// Remove any childless block, including list and table.
				while ( block && !block.equals( path.root ) &&
						!block.getFirst( childEval( block ) ) ) {
					parent = block.getParent();
					this[ atEnd ? 'setEndAt' : 'setStartAt' ]( block, CKEDITOR.POSITION_AFTER_END );
					block.remove( 1 );
					block = parent;
				}

				this.moveToBookmark( bm );
			};

		} )(),

		
		startPath: function() {
			return new CKEDITOR.dom.elementPath( this.startContainer, this.root );
		},

		
		endPath: function() {
			return new CKEDITOR.dom.elementPath( this.endContainer, this.root );
		},

		
		checkBoundaryOfElement: function( element, checkType ) {
			var checkStart = ( checkType == CKEDITOR.START );

			// Create a copy of this range, so we can manipulate it for our checks.
			var walkerRange = this.clone();

			// Collapse the range at the proper size.
			walkerRange.collapse( checkStart );

			// Expand the range to element boundary.
			walkerRange[ checkStart ? 'setStartAt' : 'setEndAt' ]( element, checkStart ? CKEDITOR.POSITION_AFTER_START : CKEDITOR.POSITION_BEFORE_END );

			// Create the walker, which will check if we have anything useful
			// in the range.
			var walker = new CKEDITOR.dom.walker( walkerRange );
			walker.evaluator = elementBoundaryEval( checkStart );

			return walker[ checkStart ? 'checkBackward' : 'checkForward' ]();
		},

		
		checkStartOfBlock: function() {
			var startContainer = this.startContainer,
				startOffset = this.startOffset;

			// [IE] Special handling for range start in text with a leading NBSP,
			// we it to be isolated, for bogus check.
			if ( CKEDITOR.env.ie && startOffset && startContainer.type == CKEDITOR.NODE_TEXT ) {
				var textBefore = CKEDITOR.tools.ltrim( startContainer.substring( 0, startOffset ) );
				if ( nbspRegExp.test( textBefore ) )
					this.trim( 0, 1 );
			}

			// Antecipate the trim() call here, so the walker will not make
			// changes to the DOM, which would not get reflected into this
			// range otherwise.
			this.trim();

			// We need to grab the block element holding the start boundary, so
			// let's use an element path for it.
			var path = new CKEDITOR.dom.elementPath( this.startContainer, this.root );

			// Creates a range starting at the block start until the range start.
			var walkerRange = this.clone();
			walkerRange.collapse( true );
			walkerRange.setStartAt( path.block || path.blockLimit, CKEDITOR.POSITION_AFTER_START );

			var walker = new CKEDITOR.dom.walker( walkerRange );
			walker.evaluator = getCheckStartEndBlockEvalFunction();

			return walker.checkBackward();
		},

		
		checkEndOfBlock: function() {
			var endContainer = this.endContainer,
				endOffset = this.endOffset;

			// [IE] Special handling for range end in text with a following NBSP,
			// we it to be isolated, for bogus check.
			if ( CKEDITOR.env.ie && endContainer.type == CKEDITOR.NODE_TEXT ) {
				var textAfter = CKEDITOR.tools.rtrim( endContainer.substring( endOffset ) );
				if ( nbspRegExp.test( textAfter ) )
					this.trim( 1, 0 );
			}

			// Antecipate the trim() call here, so the walker will not make
			// changes to the DOM, which would not get reflected into this
			// range otherwise.
			this.trim();

			// We need to grab the block element holding the start boundary, so
			// let's use an element path for it.
			var path = new CKEDITOR.dom.elementPath( this.endContainer, this.root );

			// Creates a range starting at the block start until the range start.
			var walkerRange = this.clone();
			walkerRange.collapse( false );
			walkerRange.setEndAt( path.block || path.blockLimit, CKEDITOR.POSITION_BEFORE_END );

			var walker = new CKEDITOR.dom.walker( walkerRange );
			walker.evaluator = getCheckStartEndBlockEvalFunction();

			return walker.checkForward();
		},

		
		getPreviousNode: function( evaluator, guard, boundary ) {
			var walkerRange = this.clone();
			walkerRange.collapse( 1 );
			walkerRange.setStartAt( boundary || this.root, CKEDITOR.POSITION_AFTER_START );

			var walker = new CKEDITOR.dom.walker( walkerRange );
			walker.evaluator = evaluator;
			walker.guard = guard;
			return walker.previous();
		},

		
		getNextNode: function( evaluator, guard, boundary ) {
			var walkerRange = this.clone();
			walkerRange.collapse();
			walkerRange.setEndAt( boundary || this.root, CKEDITOR.POSITION_BEFORE_END );

			var walker = new CKEDITOR.dom.walker( walkerRange );
			walker.evaluator = evaluator;
			walker.guard = guard;
			return walker.next();
		},

		
		checkReadOnly: ( function() {
			function checkNodesEditable( node, anotherEnd ) {
				while ( node ) {
					if ( node.type == CKEDITOR.NODE_ELEMENT ) {
						if ( node.getAttribute( 'contentEditable' ) == 'false' && !node.data( 'cke-editable' ) )
							return 0;

						// Range enclosed entirely in an editable element.
						else if ( node.is( 'html' ) || node.getAttribute( 'contentEditable' ) == 'true' && ( node.contains( anotherEnd ) || node.equals( anotherEnd ) ) )
							break;

					}
					node = node.getParent();
				}

				return 1;
			}

			return function() {
				var startNode = this.startContainer,
					endNode = this.endContainer;

				// Check if elements path at both boundaries are editable.
				return !( checkNodesEditable( startNode, endNode ) && checkNodesEditable( endNode, startNode ) );
			};
		} )(),

		
		moveToElementEditablePosition: function( el, isMoveToEnd ) {

			function nextDFS( node, childOnly ) {
				var next;

				if ( node.type == CKEDITOR.NODE_ELEMENT && node.isEditable( false ) )
					next = node[ isMoveToEnd ? 'getLast' : 'getFirst' ]( notIgnoredEval );

				if ( !childOnly && !next )
					next = node[ isMoveToEnd ? 'getPrevious' : 'getNext' ]( notIgnoredEval );

				return next;
			}

			// Handle non-editable element e.g. HR.
			if ( el.type == CKEDITOR.NODE_ELEMENT && !el.isEditable( false ) ) {
				this.moveToPosition( el, isMoveToEnd ? CKEDITOR.POSITION_AFTER_END : CKEDITOR.POSITION_BEFORE_START );
				return true;
			}

			var found = 0;

			while ( el ) {
				// Stop immediately if we've found a text node.
				if ( el.type == CKEDITOR.NODE_TEXT ) {
					// Put cursor before block filler.
					if ( isMoveToEnd && this.endContainer && this.checkEndOfBlock() && nbspRegExp.test( el.getText() ) )
						this.moveToPosition( el, CKEDITOR.POSITION_BEFORE_START );
					else
						this.moveToPosition( el, isMoveToEnd ? CKEDITOR.POSITION_AFTER_END : CKEDITOR.POSITION_BEFORE_START );
					found = 1;
					break;
				}

				// If an editable element is found, move inside it, but not stop the searching.
				if ( el.type == CKEDITOR.NODE_ELEMENT ) {
					if ( el.isEditable() ) {
						this.moveToPosition( el, isMoveToEnd ? CKEDITOR.POSITION_BEFORE_END : CKEDITOR.POSITION_AFTER_START );
						found = 1;
					}
					// Put cursor before padding block br.
					else if ( isMoveToEnd && el.is( 'br' ) && this.endContainer && this.checkEndOfBlock() )
						this.moveToPosition( el, CKEDITOR.POSITION_BEFORE_START );
					// Special case - non-editable block. Select entire element, because it does not make sense
					// to place collapsed selection next to it, because browsers can't handle that.
					else if ( el.getAttribute( 'contenteditable' ) == 'false' && el.is( CKEDITOR.dtd.$block ) ) {
						this.setStartBefore( el );
						this.setEndAfter( el );
						return true;
					}
				}

				el = nextDFS( el, found );
			}

			return !!found;
		},

		
		moveToClosestEditablePosition: function( element, isMoveForward ) {
			// We don't want to modify original range if there's no editable position.
			var range,
				found = 0,
				sibling,
				isElement,
				positions = [ CKEDITOR.POSITION_AFTER_END, CKEDITOR.POSITION_BEFORE_START ];

			if ( element ) {
				// Set collapsed range at one of ends of element.
				// Can't clone this range, because this range might not be yet positioned (no containers => errors).
				range = new CKEDITOR.dom.range( this.root );
				range.moveToPosition( element, positions[ isMoveForward ? 0 : 1 ] );
			} else {
				range = this.clone();
			}

			// Start element isn't a block, so we can automatically place range
			// next to it.
			if ( element && !element.is( CKEDITOR.dtd.$block ) )
				found = 1;
			else {
				// Look for first node that fulfills eval function and place range next to it.
				sibling = range[ isMoveForward ? 'getNextEditableNode' : 'getPreviousEditableNode' ]();
				if ( sibling ) {
					found = 1;
					isElement = sibling.type == CKEDITOR.NODE_ELEMENT;

					// Special case - eval accepts block element only if it's a non-editable block,
					// which we want to select, not place collapsed selection next to it (which browsers
					// can't handle).
					if ( isElement && sibling.is( CKEDITOR.dtd.$block ) && sibling.getAttribute( 'contenteditable' ) == 'false' ) {
						range.setStartAt( sibling, CKEDITOR.POSITION_BEFORE_START );
						range.setEndAt( sibling, CKEDITOR.POSITION_AFTER_END );
					}
					// Handle empty blocks which can be selection containers on old IEs.
					else if ( !CKEDITOR.env.needsBrFiller && isElement && sibling.is( CKEDITOR.dom.walker.validEmptyBlockContainers ) ) {
						range.setEnd( sibling, 0 );
						range.collapse();
					} else {
						range.moveToPosition( sibling, positions[ isMoveForward ? 1 : 0 ] );
					}
				}
			}

			if ( found )
				this.moveToRange( range );

			return !!found;
		},

		
		moveToElementEditStart: function( target ) {
			return this.moveToElementEditablePosition( target );
		},

		
		moveToElementEditEnd: function( target ) {
			return this.moveToElementEditablePosition( target, true );
		},

		
		getEnclosedNode: function() {
			var walkerRange = this.clone();

			// Optimize and analyze the range to avoid DOM destructive nature of walker. (#5780)
			walkerRange.optimize();
			if ( walkerRange.startContainer.type != CKEDITOR.NODE_ELEMENT || walkerRange.endContainer.type != CKEDITOR.NODE_ELEMENT )
				return null;

			var walker = new CKEDITOR.dom.walker( walkerRange ),
				isNotBookmarks = CKEDITOR.dom.walker.bookmark( false, true ),
				isNotWhitespaces = CKEDITOR.dom.walker.whitespaces( true );

			walker.evaluator = function( node ) {
				return isNotWhitespaces( node ) && isNotBookmarks( node );
			};
			var node = walker.next();
			walker.reset();
			return node && node.equals( walker.previous() ) ? node : null;
		},

		
		getTouchedStartNode: function() {
			var container = this.startContainer;

			if ( this.collapsed || container.type != CKEDITOR.NODE_ELEMENT )
				return container;

			return container.getChild( this.startOffset ) || container;
		},

		
		getTouchedEndNode: function() {
			var container = this.endContainer;

			if ( this.collapsed || container.type != CKEDITOR.NODE_ELEMENT )
				return container;

			return container.getChild( this.endOffset - 1 ) || container;
		},

		
		getNextEditableNode: getNextEditableNode(),

		
		getPreviousEditableNode: getNextEditableNode( 1 ),

		
		scrollIntoView: function() {

			// The reference element contains a zero-width space to avoid
			// a premature removal. The view is to be scrolled with respect
			// to this element.
			var reference = new CKEDITOR.dom.element.createFromHtml( '<span>&nbsp;</span>', this.document ),
				afterCaretNode, startContainerText, isStartText;

			var range = this.clone();

			// Work with the range to obtain a proper caret position.
			range.optimize();

			// Currently in a text node, so we need to split it into two
			// halves and put the reference between.
			if ( isStartText = range.startContainer.type == CKEDITOR.NODE_TEXT ) {
				// Keep the original content. It will be restored.
				startContainerText = range.startContainer.getText();

				// Split the startContainer at the this position.
				afterCaretNode = range.startContainer.split( range.startOffset );

				// Insert the reference between two text nodes.
				reference.insertAfter( range.startContainer );
			}

			// If not in a text node, simply insert the reference into the range.
			else {
				range.insertNode( reference );
			}

			// Scroll with respect to the reference element.
			reference.scrollIntoView();

			// Get rid of split parts if "in a text node" case.
			// Revert the original text of the startContainer.
			if ( isStartText ) {
				range.startContainer.setText( startContainerText );
				afterCaretNode.remove();
			}

			// Get rid of the reference node. It is no longer necessary.
			reference.remove();
		},

		
		_setStartContainer: function( startContainer ) {
			// %REMOVE_START%
			var isRootAscendantOrSelf = this.root.equals( startContainer ) || this.root.contains( startContainer );

			if ( !isRootAscendantOrSelf ) {
				CKEDITOR.warn( 'range-startcontainer', { startContainer: startContainer, root: this.root } );
			}
			// %REMOVE_END%
			this.startContainer = startContainer;
		},

		
		_setEndContainer: function( endContainer ) {
			// %REMOVE_START%
			var isRootAscendantOrSelf = this.root.equals( endContainer ) || this.root.contains( endContainer );

			if ( !isRootAscendantOrSelf ) {
				CKEDITOR.warn( 'range-endcontainer', { endContainer: endContainer, root: this.root } );
			}
			// %REMOVE_END%
			this.endContainer = endContainer;
		}
	};


} )();


CKEDITOR.POSITION_AFTER_START = 1;


CKEDITOR.POSITION_BEFORE_END = 2;


CKEDITOR.POSITION_BEFORE_START = 3;


CKEDITOR.POSITION_AFTER_END = 4;

CKEDITOR.ENLARGE_ELEMENT = 1;
CKEDITOR.ENLARGE_BLOCK_CONTENTS = 2;
CKEDITOR.ENLARGE_LIST_ITEM_CONTENTS = 3;
CKEDITOR.ENLARGE_INLINE = 4;

// Check boundary types.


CKEDITOR.START = 1;


CKEDITOR.END = 2;

// Shrink range types.


CKEDITOR.SHRINK_ELEMENT = 1;


CKEDITOR.SHRINK_TEXT = 2;
