/** @jsx React.DOM */

Cosmos.components.MovieCredits = React.createClass({
  mixins: [Cosmos.mixins.ClassName,
           Cosmos.mixins.PersistState],
  defaultClass: 'movie-credits',
  render: function() {
    var directors = this.getCrewFromDepartment('Directing'),
        writers = this.getCrewFromDepartment('Writing'),
        actors = this.getActors();
    return (
      React.DOM.ul( {className:"movie-credits"}, 
        React.DOM.li( {className:"directors"}, 
          this.getItemPrefix('Director', directors.length),": ",
          React.DOM.strong(null, directors.join(', '))
        ),
        React.DOM.li( {className:"writers"}, 
          this.getItemPrefix('Writer', writers.length),": ",
          React.DOM.strong(null, writers.join(', '))
        ),
        React.DOM.li( {className:"actors"}, 
          this.getItemPrefix('Actor', actors.length),": ",
          React.DOM.strong(null, actors.join(', '))
        )
      )
    );
  },
  getCrewFromDepartment: function(department) {
    var crew = _.filter(this.props.crew, function(member) {
        return member.department == department;
    });
    return _.map(crew, function(member) {
      return member.name;
    });
  },
  getActors: function() {
    return _.map(this.props.cast.slice(0, 4), function(actor) {
      return actor.name;
    });
  },
  getItemPrefix: function(singular, itemLength) {
    return itemLength > 1 ? singular + 's' : singular;
  }
});

/** @jsx React.DOM */

Cosmos.components.MovieThumbnail = React.createClass({
  mixins: [Cosmos.mixins.ClassName,
           Cosmos.mixins.PersistState,
           Cosmos.mixins.Url],
  defaultClass: 'movie-thumbnail',
  render: function() {
    return (
      React.DOM.a( {className:this.getClassName(),
         href:this.getUrlFromProps(this.getPropsForMovie()),
         onClick:this.routeLink,
         style:{
           backgroundImage: 'url(' + this.getUrlForPosterImage() + ')'
         }}
      )
    );
  },
  getPropsForMovie: function() {
    return {
      component: 'Movie',
      posterPath: this.props.poster_path,
      dataUrl: App.MOVIEDB_API_ROOT + '/movie/' + this.props.id +
               '?append_to_response=credits,similar_movies' +
               '&api_key=' + App.MOVIEDB_API_KEY
    };
  },
  getUrlForPosterImage: function() {
    return App.MOVIEDB_IMG_ROOT + '/w154' + this.props.poster_path;
  }
});

/** @jsx React.DOM */

Cosmos.components.Movie = React.createClass({
  mixins: [Cosmos.mixins.ClassName,
           Cosmos.mixins.DataFetch,
           Cosmos.mixins.PersistState],
  defaultClass: 'movie full-background',
  render: function() {
    var backgroundStyle = this.getBackgroundStyle();
    return (
      React.DOM.div( {className:this.getClassName(), style:backgroundStyle}, 
        React.DOM.div( {className:"full-background-content"}, 
          this.getContentDOM()
        )
      )
    );
  },
  getContentDOM: function() {
    if (_.isEmpty(this.state.data)) {
      return null;
    }
    return (
      React.DOM.div( {className:"content-wrapper"}, 
        React.DOM.h1( {className:"movie-title"}, 
          this.state.data.title + ' ',
          React.DOM.span( {className:"year"}, "(",this.getReleaseYear(),")")
        ),
        Cosmos( {component:"MovieCredits",
                cast:this.state.data.credits.cast,
                crew:this.state.data.credits.crew} ),
        React.DOM.p( {className:"movie-plot"}, this.state.data.overview),
        React.DOM.p( {className:"similar-to"}, "similar to..."),
        Cosmos( {component:"List",
                itemComponent:"MovieThumbnail",
                class:"movie-list",
                state:{data: this.getSimilarMovies()}} )
      )
    );
  },
  getBackgroundStyle: function() {
    if (!this.getPosterPath()) {
      return {};
    }
    return {
      // We load the SD version first, since we already have it in cache
      // from the thumbnail leading to this movie
      backgroundImage: 'url(' + this.getUrlForBackgroundImage(780) + '),' +
                       'url(' + this.getUrlForBackgroundImage(154) + ')'
    }
  },
  getReleaseYear: function() {
    return new Date(this.state.data.release_date).getFullYear();
  },
  getSimilarMovies: function() {
    var movies = this.state.data.similar_movies.results || [];
    // Can't show thumbnails without images
    movies = _.filter(movies, function(movie) {
      return !!movie.poster_path;
    });
    // Sort them by vote_average, descending
    movies = _.sortBy(movies, function(movie) {
      // Movies with less than 5 votes go to right
      var average = movie.vote_count > 5 ? movie.vote_average : 0;
      return -average;
    });
    return movies;
  },
  getUrlForBackgroundImage: function(size) {
    return App.MOVIEDB_IMG_ROOT + '/w' + size + this.getPosterPath();
  },
  getPosterPath: function() {
    // The poster path can be sent directly through props to load an already
    // cached image
    return this.props.posterPath || this.state.data.poster_path;
  }
});
