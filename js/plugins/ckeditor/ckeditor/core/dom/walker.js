

( function() {
	// This function is to be called under a "walker" instance scope.
	function iterate( rtl, breakOnFalse ) {
		var range = this.range;

		// Return null if we have reached the end.
		if ( this._.end )
			return null;

		// This is the first call. Initialize it.
		if ( !this._.start ) {
			this._.start = 1;

			// A collapsed range must return null at first call.
			if ( range.collapsed ) {
				this.end();
				return null;
			}

			// Move outside of text node edges.
			range.optimize();
		}

		var node,
			startCt = range.startContainer,
			endCt = range.endContainer,
			startOffset = range.startOffset,
			endOffset = range.endOffset,
			guard,
			userGuard = this.guard,
			type = this.type,
			getSourceNodeFn = ( rtl ? 'getPreviousSourceNode' : 'getNextSourceNode' );

		// Create the LTR guard function, if necessary.
		if ( !rtl && !this._.guardLTR ) {
			// The node that stops walker from moving up.
			var limitLTR = endCt.type == CKEDITOR.NODE_ELEMENT ? endCt : endCt.getParent();

			// The node that stops the walker from going to next.
			var blockerLTR = endCt.type == CKEDITOR.NODE_ELEMENT ? endCt.getChild( endOffset ) : endCt.getNext();

			this._.guardLTR = function( node, movingOut ) {
				return ( ( !movingOut || !limitLTR.equals( node ) ) && ( !blockerLTR || !node.equals( blockerLTR ) ) && ( node.type != CKEDITOR.NODE_ELEMENT || !movingOut || !node.equals( range.root ) ) );
			};
		}

		// Create the RTL guard function, if necessary.
		if ( rtl && !this._.guardRTL ) {
			// The node that stops walker from moving up.
			var limitRTL = startCt.type == CKEDITOR.NODE_ELEMENT ? startCt : startCt.getParent();

			// The node that stops the walker from going to next.
			var blockerRTL = startCt.type == CKEDITOR.NODE_ELEMENT ? startOffset ? startCt.getChild( startOffset - 1 ) : null : startCt.getPrevious();

			this._.guardRTL = function( node, movingOut ) {
				return ( ( !movingOut || !limitRTL.equals( node ) ) && ( !blockerRTL || !node.equals( blockerRTL ) ) && ( node.type != CKEDITOR.NODE_ELEMENT || !movingOut || !node.equals( range.root ) ) );
			};
		}

		// Define which guard function to use.
		var stopGuard = rtl ? this._.guardRTL : this._.guardLTR;

		// Make the user defined guard function participate in the process,
		// otherwise simply use the boundary guard.
		if ( userGuard ) {
			guard = function( node, movingOut ) {
				if ( stopGuard( node, movingOut ) === false )
					return false;

				return userGuard( node, movingOut );
			};
		} else {
			guard = stopGuard;
		}

		if ( this.current )
			node = this.current[ getSourceNodeFn ]( false, type, guard );
		else {
			// Get the first node to be returned.
			if ( rtl ) {
				node = endCt;

				if ( node.type == CKEDITOR.NODE_ELEMENT ) {
					if ( endOffset > 0 )
						node = node.getChild( endOffset - 1 );
					else
						node = ( guard( node, true ) === false ) ? null : node.getPreviousSourceNode( true, type, guard );
				}
			} else {
				node = startCt;

				if ( node.type == CKEDITOR.NODE_ELEMENT ) {
					if ( !( node = node.getChild( startOffset ) ) )
						node = ( guard( startCt, true ) === false ) ? null : startCt.getNextSourceNode( true, type, guard );
				}
			}

			if ( node && guard( node ) === false )
				node = null;
		}

		while ( node && !this._.end ) {
			this.current = node;

			if ( !this.evaluator || this.evaluator( node ) !== false ) {
				if ( !breakOnFalse )
					return node;
			} else if ( breakOnFalse && this.evaluator ) {
				return false;
			}

			node = node[ getSourceNodeFn ]( false, type, guard );
		}

		this.end();
		return this.current = null;
	}

	function iterateToLast( rtl ) {
		var node,
			last = null;

		while ( ( node = iterate.call( this, rtl ) ) )
			last = node;

		return last;
	}

	
	CKEDITOR.dom.walker = CKEDITOR.tools.createClass( {
		
		$: function( range ) {
			this.range = range;

			
			// this.evaluator = null;

			
			// this.guard = null;

			
			this._ = {};
		},

		//		statics :
		//		{
		//			
		//			createOnNodes : function( startNode, endNode, startInclusive, endInclusive )
		//			{
		//				var range = new CKEDITOR.dom.range();
		//				if ( startNode )
		//					range.setStartAt( startNode, startInclusive ? CKEDITOR.POSITION_BEFORE_START : CKEDITOR.POSITION_AFTER_END ) ;
		//				else
		//					range.setStartAt( startNode.getDocument().getBody(), CKEDITOR.POSITION_AFTER_START ) ;
		//
		//				if ( endNode )
		//					range.setEndAt( endNode, endInclusive ? CKEDITOR.POSITION_AFTER_END : CKEDITOR.POSITION_BEFORE_START ) ;
		//				else
		//					range.setEndAt( startNode.getDocument().getBody(), CKEDITOR.POSITION_BEFORE_END ) ;
		//
		//				return new CKEDITOR.dom.walker( range );
		//			}
		//		},
		//
		proto: {
			
			end: function() {
				this._.end = 1;
			},

			
			next: function() {
				return iterate.call( this );
			},

			
			previous: function() {
				return iterate.call( this, 1 );
			},

			
			checkForward: function() {
				return iterate.call( this, 0, 1 ) !== false;
			},

			
			checkBackward: function() {
				return iterate.call( this, 1, 1 ) !== false;
			},

			
			lastForward: function() {
				return iterateToLast.call( this );
			},

			
			lastBackward: function() {
				return iterateToLast.call( this, 1 );
			},

			
			reset: function() {
				delete this.current;
				this._ = {};
			}

		}
	} );

	// Anything whose display computed style is block, list-item, table,
	// table-row-group, table-header-group, table-footer-group, table-row,
	// table-column-group, table-column, table-cell, table-caption, or whose node
	// name is hr, br (when enterMode is br only) is a block boundary.
	var blockBoundaryDisplayMatch = {
			block: 1, 'list-item': 1, table: 1, 'table-row-group': 1,
			'table-header-group': 1, 'table-footer-group': 1, 'table-row': 1, 'table-column-group': 1,
			'table-column': 1, 'table-cell': 1, 'table-caption': 1
		},
		outOfFlowPositions = { absolute: 1, fixed: 1 };

	
	CKEDITOR.dom.element.prototype.isBlockBoundary = function( customNodeNames ) {
		// Whether element is in normal page flow. Floated or positioned elements are out of page flow.
		// Don't consider floated or positioned formatting as block boundary, fall back to dtd check in that case. (#6297)
		var inPageFlow = this.getComputedStyle( 'float' ) == 'none' && !( this.getComputedStyle( 'position' ) in outOfFlowPositions );

		if ( inPageFlow && blockBoundaryDisplayMatch[ this.getComputedStyle( 'display' ) ] )
			return true;

		// Either in $block or in customNodeNames if defined.
		return !!( this.is( CKEDITOR.dtd.$block ) || customNodeNames && this.is( customNodeNames ) );
	};

	
	CKEDITOR.dom.walker.blockBoundary = function( customNodeNames ) {
		return function( node ) {
			return !( node.type == CKEDITOR.NODE_ELEMENT && node.isBlockBoundary( customNodeNames ) );
		};
	};

	
	CKEDITOR.dom.walker.listItemBoundary = function() {
		return this.blockBoundary( { br: 1 } );
	};

	
	CKEDITOR.dom.walker.bookmark = function( contentOnly, isReject ) {
		function isBookmarkNode( node ) {
			return ( node && node.getName && node.getName() == 'span' && node.data( 'cke-bookmark' ) );
		}

		return function( node ) {
			var isBookmark, parent;
			// Is bookmark inner text node?
			isBookmark = ( node && node.type != CKEDITOR.NODE_ELEMENT && ( parent = node.getParent() ) && isBookmarkNode( parent ) );
			// Is bookmark node?
			isBookmark = contentOnly ? isBookmark : isBookmark || isBookmarkNode( node );
			return !!( isReject ^ isBookmark );
		};
	};

	
	CKEDITOR.dom.walker.whitespaces = function( isReject ) {
		return function( node ) {
			var isWhitespace;
			if ( node && node.type == CKEDITOR.NODE_TEXT ) {
				// Whitespace, as well as the Filling Char Sequence text node used in Webkit. (#9384, #13816)
				isWhitespace = !CKEDITOR.tools.trim( node.getText() ) ||
					CKEDITOR.env.webkit && node.getText() == CKEDITOR.dom.selection.FILLING_CHAR_SEQUENCE;
			}

			return !!( isReject ^ isWhitespace );
		};
	};

	
	CKEDITOR.dom.walker.invisible = function( isReject ) {
		var whitespace = CKEDITOR.dom.walker.whitespaces(),
			// #12221 (Chrome) plus #11111 (Safari).
			offsetWidth0 = CKEDITOR.env.webkit ? 1 : 0;

		return function( node ) {
			var invisible;

			if ( whitespace( node ) )
				invisible = 1;
			else {
				// Visibility should be checked on element.
				if ( node.type == CKEDITOR.NODE_TEXT )
					node = node.getParent();

				// Nodes that take no spaces in wysiwyg:
				// 1. White-spaces but not including NBSP.
				// 2. Empty inline elements, e.g. <b></b>.
				// 3. <br> elements (bogus, surrounded by text) (#12423).
				invisible = node.$.offsetWidth <= offsetWidth0;
			}

			return !!( isReject ^ invisible );
		};
	};

	
	CKEDITOR.dom.walker.nodeType = function( type, isReject ) {
		return function( node ) {
			return !!( isReject ^ ( node.type == type ) );
		};
	};

	
	CKEDITOR.dom.walker.bogus = function( isReject ) {
		function nonEmpty( node ) {
			return !isWhitespaces( node ) && !isBookmark( node );
		}

		return function( node ) {
			var isBogus = CKEDITOR.env.needsBrFiller ? node.is && node.is( 'br' ) : node.getText && tailNbspRegex.test( node.getText() );

			if ( isBogus ) {
				var parent = node.getParent(),
					next = node.getNext( nonEmpty );

				isBogus = parent.isBlockBoundary() && ( !next || next.type == CKEDITOR.NODE_ELEMENT && next.isBlockBoundary() );
			}

			return !!( isReject ^ isBogus );
		};
	};

	
	CKEDITOR.dom.walker.temp = function( isReject ) {
		return function( node ) {
			if ( node.type != CKEDITOR.NODE_ELEMENT )
				node = node.getParent();

			var isTemp = node && node.hasAttribute( 'data-cke-temp' );

			return !!( isReject ^ isTemp );
		};
	};

	var tailNbspRegex = /^[\t\r\n ]*(?:&nbsp;|\xa0)$/,
		isWhitespaces = CKEDITOR.dom.walker.whitespaces(),
		isBookmark = CKEDITOR.dom.walker.bookmark(),
		isTemp = CKEDITOR.dom.walker.temp(),
		toSkip = function( node ) {
			return isBookmark( node ) ||
				isWhitespaces( node ) ||
				node.type == CKEDITOR.NODE_ELEMENT && node.is( CKEDITOR.dtd.$inline ) && !node.is( CKEDITOR.dtd.$empty );
		};

	
	CKEDITOR.dom.walker.ignored = function( isReject ) {
		return function( node ) {
			var isIgnored = isWhitespaces( node ) || isBookmark( node ) || isTemp( node );

			return !!( isReject ^ isIgnored );
		};
	};

	var isIgnored = CKEDITOR.dom.walker.ignored();

	
	CKEDITOR.dom.walker.empty = function( isReject ) {
		return function( node ) {
			var i = 0,
				l = node.getChildCount();

			for ( ; i < l; ++i ) {
				if ( !isIgnored( node.getChild( i ) ) ) {
					return !!isReject;
				}
			}

			return !isReject;
		};
	};

	var isEmpty = CKEDITOR.dom.walker.empty();

	function filterTextContainers( dtd ) {
		var hash = {},
			name;

		for ( name in dtd ) {
			if ( CKEDITOR.dtd[ name ][ '#' ] )
				hash[ name ] = 1;
		}
		return hash;
	}

	
	var validEmptyBlocks = CKEDITOR.dom.walker.validEmptyBlockContainers = CKEDITOR.tools.extend(
		filterTextContainers( CKEDITOR.dtd.$block ),
		{ caption: 1, td: 1, th: 1 }
	);

	function isEditable( node ) {
		// Skip temporary elements, bookmarks and whitespaces.
		if ( isIgnored( node ) )
			return false;

		if ( node.type == CKEDITOR.NODE_TEXT )
			return true;

		if ( node.type == CKEDITOR.NODE_ELEMENT ) {
			// All inline and non-editable elements are valid editable places.
			// Note: the <hr> is currently the only element in CKEDITOR.dtd.$empty and CKEDITOR.dtd.$block,
			// but generally speaking we need an intersection of these two sets.
			// Note: non-editable block has to be treated differently (should be selected entirely).
			if ( node.is( CKEDITOR.dtd.$inline ) || node.is( 'hr' ) || node.getAttribute( 'contenteditable' ) == 'false' )
				return true;

			// Empty blocks are editable on IE.
			if ( !CKEDITOR.env.needsBrFiller && node.is( validEmptyBlocks ) && isEmpty( node ) )
				return true;
		}

		// Skip all other nodes.
		return false;
	}

	
	CKEDITOR.dom.walker.editable = function( isReject ) {
		return function( node ) {
			return !!( isReject ^ isEditable( node ) );
		};
	};

	
	CKEDITOR.dom.element.prototype.getBogus = function() {
		// Bogus are not always at the end, e.g. <p><a>text<br /></a></p> (#7070).
		var tail = this;
		do {
			tail = tail.getPreviousSourceNode();
		}
		while ( toSkip( tail ) );

		if ( tail && ( CKEDITOR.env.needsBrFiller ? tail.is && tail.is( 'br' ) : tail.getText && tailNbspRegex.test( tail.getText() ) ) )
			return tail;

		return false;
	};

} )();
